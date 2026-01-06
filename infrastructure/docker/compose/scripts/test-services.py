#!/usr/bin/env python3
"""
Meeshy Docker Services Health Check
====================================
Cross-platform script (macOS, Linux, Windows) to test Docker services health.

Usage:
    python3 test-services.py [--mode dev|local|prod] [--verbose]

Modes:
    dev   - Test localhost HTTP services (docker-compose.dev.yml)
    local - Test *.meeshy.local HTTPS services (docker-compose.local.yml)
    prod  - Test *.meeshy.me HTTPS services (docker-compose.prod.yml)
"""

import sys
import ssl
import json
import argparse
import urllib.request
import urllib.error
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass

# =============================================================================
# Configuration
# =============================================================================

@dataclass
class ServiceConfig:
    """Configuration for a service to test."""
    name: str
    url: str
    expected_status: int = 200
    timeout: int = 10
    verify_ssl: bool = True

# Service definitions per mode
SERVICES: Dict[str, List[ServiceConfig]] = {
    "dev": [
        ServiceConfig("MongoDB", "http://localhost:27017", expected_status=200),
        ServiceConfig("Redis", "http://localhost:6379", expected_status=200),  # Will fail HTTP, but port check
        ServiceConfig("NoSQLClient", "http://localhost:3001"),
        ServiceConfig("Redis UI", "http://localhost:7843"),
        ServiceConfig("Gateway", "http://localhost:3000/health"),
        ServiceConfig("Translator", "http://localhost:8000/health"),
        ServiceConfig("Frontend", "http://localhost:3100"),
    ],
    "local": [
        ServiceConfig("Traefik Dashboard", "https://traefik.meeshy.local:8080/dashboard/", verify_ssl=False),
        ServiceConfig("MongoDB UI", "https://mongo.meeshy.local", verify_ssl=False),
        ServiceConfig("Redis UI", "https://redis.meeshy.local", verify_ssl=False),
        ServiceConfig("Gateway", "https://gate.meeshy.local/health", verify_ssl=False),
        ServiceConfig("Translator", "https://ml.meeshy.local/health", verify_ssl=False),
        ServiceConfig("Frontend", "https://meeshy.local", verify_ssl=False),
        ServiceConfig("Static Files", "https://static.meeshy.local/health", verify_ssl=False),
    ],
    "prod": [
        ServiceConfig("Traefik Dashboard", "https://traefik.meeshy.me/dashboard/"),
        ServiceConfig("MongoDB UI", "https://mongo.meeshy.me"),
        ServiceConfig("Redis UI", "https://redis.meeshy.me"),
        ServiceConfig("Gateway", "https://gate.meeshy.me/health"),
        ServiceConfig("Translator", "https://ml.meeshy.me/health"),
        ServiceConfig("Frontend", "https://meeshy.me"),
        ServiceConfig("Static Files", "https://static.meeshy.me/health"),
    ],
}

# Colors for terminal output (ANSI codes)
class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    RESET = "\033[0m"
    BOLD = "\033[1m"

def supports_color() -> bool:
    """Check if terminal supports ANSI colors."""
    import os
    if os.name == 'nt':  # Windows
        return os.environ.get('TERM') == 'xterm' or 'ANSICON' in os.environ
    return hasattr(sys.stdout, 'isatty') and sys.stdout.isatty()

def colorize(text: str, color: str) -> str:
    """Apply color to text if supported."""
    if supports_color():
        return f"{color}{text}{Colors.RESET}"
    return text

# =============================================================================
# Health Check Functions
# =============================================================================

def check_tcp_port(host: str, port: int, timeout: int = 5) -> Tuple[bool, str]:
    """Check if a TCP port is open."""
    import socket
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        if result == 0:
            return True, f"Port {port} is open"
        return False, f"Port {port} is closed"
    except socket.error as e:
        return False, f"Socket error: {e}"

def check_http_service(service: ServiceConfig, verbose: bool = False) -> Tuple[bool, str, Optional[int]]:
    """
    Check HTTP/HTTPS service health.
    Returns: (success, message, status_code)
    """
    try:
        # Create SSL context for HTTPS
        ssl_context = None
        if service.url.startswith("https://"):
            ssl_context = ssl.create_default_context()
            if not service.verify_ssl:
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE

        # Create request
        request = urllib.request.Request(
            service.url,
            headers={"User-Agent": "Meeshy-Health-Check/1.0"}
        )

        # Execute request
        with urllib.request.urlopen(request, timeout=service.timeout, context=ssl_context) as response:
            status_code = response.getcode()
            if status_code == service.expected_status:
                return True, f"HTTP {status_code}", status_code
            return False, f"HTTP {status_code} (expected {service.expected_status})", status_code

    except urllib.error.HTTPError as e:
        # Some services may return different codes but still be healthy
        if e.code in [200, 301, 302, 401, 403]:  # Redirects and auth-protected are OK
            return True, f"HTTP {e.code}", e.code
        return False, f"HTTP {e.code}: {e.reason}", e.code

    except urllib.error.URLError as e:
        reason = str(e.reason)
        if "Connection refused" in reason:
            return False, "Connection refused (service not running)", None
        if "Name or service not known" in reason or "nodename nor servname" in reason:
            return False, "DNS resolution failed (check /etc/hosts)", None
        return False, f"URL Error: {reason}", None

    except ssl.SSLError as e:
        return False, f"SSL Error: {e}", None

    except TimeoutError:
        return False, "Timeout", None

    except Exception as e:
        return False, f"Error: {e}", None

def check_service(service: ServiceConfig, verbose: bool = False) -> Tuple[bool, str]:
    """Check a service and return (success, message)."""
    # Special handling for Redis (not HTTP)
    if "redis" in service.url.lower() and ":6379" in service.url:
        host = service.url.split("://")[1].split(":")[0]
        return check_tcp_port(host, 6379, service.timeout)

    # Special handling for MongoDB (not HTTP)
    if "mongodb" in service.url.lower() or ":27017" in service.url:
        host = service.url.replace("http://", "").split(":")[0]
        return check_tcp_port(host, 27017, service.timeout)

    # HTTP/HTTPS check
    success, message, status_code = check_http_service(service, verbose)
    return success, message

# =============================================================================
# Main Functions
# =============================================================================

def run_health_checks(mode: str, verbose: bool = False) -> Tuple[int, int]:
    """
    Run health checks for all services in the specified mode.
    Returns: (passed_count, failed_count)
    """
    services = SERVICES.get(mode, [])
    if not services:
        print(colorize(f"Unknown mode: {mode}", Colors.RED))
        return 0, 0

    print(colorize(f"\n{'=' * 60}", Colors.BLUE))
    print(colorize(f" Meeshy Docker Services Health Check", Colors.BOLD))
    print(colorize(f" Mode: {mode}", Colors.BLUE))
    print(colorize(f"{'=' * 60}\n", Colors.BLUE))

    passed = 0
    failed = 0

    for service in services:
        success, message = check_service(service, verbose)

        if success:
            status = colorize("✓ PASS", Colors.GREEN)
            passed += 1
        else:
            status = colorize("✗ FAIL", Colors.RED)
            failed += 1

        print(f"  {status}  {service.name:<20} {message}")
        if verbose:
            print(f"         URL: {service.url}")

    # Summary
    print(colorize(f"\n{'=' * 60}", Colors.BLUE))
    total = passed + failed
    if failed == 0:
        print(colorize(f" All {total} services are healthy! ✓", Colors.GREEN))
    else:
        print(f" Results: {colorize(f'{passed} passed', Colors.GREEN)}, {colorize(f'{failed} failed', Colors.RED)}")
    print(colorize(f"{'=' * 60}\n", Colors.BLUE))

    return passed, failed

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Meeshy Docker Services Health Check",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python3 test-services.py --mode dev      # Test localhost HTTP
    python3 test-services.py --mode local    # Test *.meeshy.local HTTPS
    python3 test-services.py --mode prod     # Test *.meeshy.me HTTPS
    python3 test-services.py --verbose       # Show detailed output
        """
    )
    parser.add_argument(
        "--mode", "-m",
        choices=["dev", "local", "prod"],
        default="local",
        help="Testing mode (default: local)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show verbose output"
    )

    args = parser.parse_args()

    passed, failed = run_health_checks(args.mode, args.verbose)

    # Exit with appropriate code
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
