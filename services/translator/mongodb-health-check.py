#!/usr/bin/env python3
"""
Script de vérification de santé MongoDB pour AI Deploy
Teste la connectivité et la configuration MongoDB
"""

import os
import sys
import asyncio
import socket
import time
from urllib.parse import urlparse
import dns.resolver
import subprocess

class MongoDBHealthChecker:
    def __init__(self):
        self.database_url = os.getenv('DATABASE_URL')
        print(f"[HEALTH-CHECK] Using DATABASE_URL: {self.database_url}")
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")
        
        self.parsed_url = urlparse(self.database_url)
        self.hostname = self.parsed_url.hostname
        self.port = self.parsed_url.port or 27017
        
    def test_dns_resolution(self):
        """Test DNS resolution for MongoDB hostname"""
        print(f"[HEALTH-CHECK] Testing DNS resolution for: {self.hostname}")
        
        try:
            # Test getaddrinfo first (more reliable for containers)
            import socket
            result = socket.getaddrinfo(self.hostname, self.port, socket.AF_UNSPEC, socket.SOCK_STREAM)
            ips = [addr[4][0] for addr in result]
            print(f"[HEALTH-CHECK] DNS resolved to IPs: {list(set(ips))}")
            
            # Fallback to dns.resolver for detailed info
            try:
                resolver = dns.resolver.Resolver()
                resolver.timeout = 10
                resolver.lifetime = 30
                
                # Test A record
                answers = resolver.resolve(self.hostname, 'A')
                dns_ips = [str(rdata) for rdata in answers]
                print(f"[HEALTH-CHECK] DNS A records: {dns_ips}")
            except Exception as dns_e:
                print(f"[HEALTH-CHECK] DNS resolver warning: {dns_e}")
                # Continue anyway if getaddrinfo worked
            
            return True
            
        except Exception as e:
            print(f"[HEALTH-CHECK] DNS resolution failed: {e}")
            # Try alternative DNS resolution
            try:
                import subprocess
                result = subprocess.run(['nslookup', self.hostname], capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    print(f"[HEALTH-CHECK] nslookup output: {result.stdout.strip()}")
                    return True
            except:
                pass
            return False
    
    def test_tcp_connectivity(self):
        """Test TCP connectivity to MongoDB"""
        print(f"[HEALTH-CHECK] Testing TCP connectivity to {self.hostname}:{self.port}")
        
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            
            start_time = time.time()
            result = sock.connect_ex((self.hostname, self.port))
            end_time = time.time()
            
            sock.close()
            
            if result == 0:
                latency = (end_time - start_time) * 1000
                print(f"[HEALTH-CHECK] TCP connection successful (latency: {latency:.2f}ms)")
                return True
            else:
                print(f"[HEALTH-CHECK] TCP connection failed with code: {result}")
                return False
                
        except Exception as e:
            print(f"[HEALTH-CHECK] TCP connectivity test failed: {e}")
            return False
    

    def run_health_check(self):
        """Run complete health check"""
        print("[HEALTH-CHECK] Starting MongoDB health check...")
        print(f"[HEALTH-CHECK] Target: {self.hostname}:{self.port}")
        
        tests = [
            ("DNS Resolution", self.test_dns_resolution),
            ("TCP Connectivity", self.test_tcp_connectivity)
        ]
        
        results = {}
        
        for test_name, test_func in tests:
            print(f"\n[HEALTH-CHECK] Running: {test_name}")
            try:
                results[test_name] = test_func()
            except Exception as e:
                print(f"[HEALTH-CHECK] {test_name} failed with exception: {e}")
                results[test_name] = False
        
        # Summary
        print(f"\n[HEALTH-CHECK] Results Summary:")
        all_passed = True
        for test_name, passed in results.items():
            status = "PASS" if passed else "FAIL"
            print(f"  {test_name}: {status}")
            if not passed:
                all_passed = False
        
        if all_passed:
            print("[HEALTH-CHECK] All tests passed!")
            return True
        else:
            print("[HEALTH-CHECK] Some tests failed")
            return False

def main():
    try:
        checker = MongoDBHealthChecker()
        success = checker.run_health_check()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"[HEALTH-CHECK] Health check failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
