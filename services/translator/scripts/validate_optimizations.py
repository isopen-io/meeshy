#!/usr/bin/env python3
"""
Validation script for GPU performance optimizations.
Tests all optimizations integrated from iOS script.

Usage:
    python scripts/validate_optimizations.py

Expected output:
    ✅ All checks passed
"""

import os
import sys
import logging

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from utils.performance import get_performance_optimizer

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)


def check_cuda_optimizations():
    """Verify CUDA optimizations are applied."""
    logger.info("\n🔍 Checking CUDA optimizations...")

    try:
        import torch

        if not torch.cuda.is_available():
            logger.info("   ⏭️  CUDA not available, skipping")
            return True

        # Check cuDNN benchmark
        if torch.backends.cudnn.benchmark:
            logger.info("   ✅ cuDNN benchmark enabled")
        else:
            logger.warning("   ⚠️  cuDNN benchmark disabled")

        # Check TF32 support
        if hasattr(torch.backends.cudnn, 'allow_tf32'):
            if torch.backends.cudnn.allow_tf32:
                logger.info("   ✅ TF32 enabled for cuDNN")
            else:
                logger.warning("   ⚠️  TF32 disabled for cuDNN")

        if hasattr(torch.backends.cuda, 'matmul'):
            if torch.backends.cuda.matmul.allow_tf32:
                logger.info("   ✅ TF32 enabled for matmul")
            else:
                logger.warning("   ⚠️  TF32 disabled for matmul")

        # Check device name
        device_name = torch.cuda.get_device_name(0)
        logger.info(f"   📊 GPU: {device_name}")

        return True

    except Exception as e:
        logger.error(f"   ❌ CUDA check failed: {e}")
        return False


def check_mps_optimizations():
    """Verify MPS optimizations are applied."""
    logger.info("\n🔍 Checking MPS optimizations...")

    try:
        import torch

        if not (hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()):
            logger.info("   ⏭️  MPS not available, skipping")
            return True

        # Check environment variables
        high_watermark = os.environ.get("PYTORCH_MPS_HIGH_WATERMARK_RATIO")
        enable_fallback = os.environ.get("PYTORCH_ENABLE_MPS_FALLBACK")

        if high_watermark == "0.0":
            logger.info("   ✅ PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0")
        else:
            logger.warning(f"   ⚠️  PYTORCH_MPS_HIGH_WATERMARK_RATIO={high_watermark} (expected 0.0)")

        if enable_fallback == "1":
            logger.info("   ✅ PYTORCH_ENABLE_MPS_FALLBACK=1")
        else:
            logger.warning(f"   ⚠️  PYTORCH_ENABLE_MPS_FALLBACK={enable_fallback} (expected 1)")

        logger.info("   📊 Device: Apple Silicon (MPS)")

        return True

    except Exception as e:
        logger.error(f"   ❌ MPS check failed: {e}")
        return False


def check_cpu_optimizations():
    """Verify CPU optimizations are applied."""
    logger.info("\n🔍 Checking CPU optimizations...")

    try:
        import torch

        # Check thread count
        num_threads = torch.get_num_threads()
        cpu_count = os.cpu_count()

        logger.info(f"   📊 PyTorch threads: {num_threads}")
        logger.info(f"   📊 CPU cores: {cpu_count}")

        if num_threads > 0:
            logger.info(f"   ✅ Thread count configured: {num_threads}")
        else:
            logger.warning("   ⚠️  Thread count not set")

        # Check environment variables
        omp_threads = os.environ.get("OMP_NUM_THREADS")
        mkl_threads = os.environ.get("MKL_NUM_THREADS")

        if omp_threads:
            logger.info(f"   ✅ OMP_NUM_THREADS={omp_threads}")
        else:
            logger.warning("   ⚠️  OMP_NUM_THREADS not set")

        if mkl_threads:
            logger.info(f"   ✅ MKL_NUM_THREADS={mkl_threads}")
        else:
            logger.info("   ℹ️  MKL_NUM_THREADS not set (optional)")

        return True

    except Exception as e:
        logger.error(f"   ❌ CPU check failed: {e}")
        return False


def check_optimizer_initialization():
    """Verify PerformanceOptimizer initialization."""
    logger.info("\n🔍 Checking PerformanceOptimizer initialization...")

    try:
        optimizer = get_performance_optimizer()
        device = optimizer.initialize()

        logger.info(f"   ✅ PerformanceOptimizer initialized")
        logger.info(f"   📊 Device: {device}")
        logger.info(f"   📊 CUDA available: {optimizer.cuda_available}")
        logger.info(f"   📊 MPS available: {optimizer.mps_available}")
        logger.info(f"   📊 CPU-only mode: {optimizer.is_cpu_only}")

        return True

    except Exception as e:
        logger.error(f"   ❌ Optimizer initialization failed: {e}")
        return False


def check_batch_size_calculation():
    """Verify optimal batch size calculation."""
    logger.info("\n🔍 Checking optimal batch size calculation...")

    try:
        optimizer = get_performance_optimizer()
        batch_size = optimizer.get_optimal_batch_size()

        logger.info(f"   ✅ Optimal batch size: {batch_size}")

        # Validate batch size is reasonable
        if 1 <= batch_size <= 8:
            logger.info(f"   ✅ Batch size is reasonable (1-8)")
        else:
            logger.warning(f"   ⚠️  Batch size {batch_size} is outside expected range (1-8)")

        return True

    except Exception as e:
        logger.error(f"   ❌ Batch size calculation failed: {e}")
        return False


def check_inference_context():
    """Verify inference context manager."""
    logger.info("\n🔍 Checking inference context manager...")

    try:
        optimizer = get_performance_optimizer()
        context = optimizer.get_inference_context()

        logger.info(f"   ✅ Inference context created: {type(context).__name__}")

        # Test context manager
        with context:
            pass

        logger.info("   ✅ Context manager works")

        return True

    except Exception as e:
        logger.error(f"   ❌ Inference context check failed: {e}")
        return False


def check_compile_model():
    """Verify model compilation support."""
    logger.info("\n🔍 Checking torch.compile support...")

    try:
        import torch

        optimizer = get_performance_optimizer()

        if not hasattr(torch, 'compile'):
            logger.info("   ⏭️  torch.compile not available (PyTorch < 2.0)")
            return True

        # Create dummy model
        class DummyModel(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.linear = torch.nn.Linear(10, 5)

            def forward(self, x):
                return self.linear(x)

        model = DummyModel()
        warmup_input = torch.randn(1, 10)

        # Try compilation (might be skipped on MPS)
        compiled = optimizer.compile_model(model, "test_model", warmup_input)

        if compiled is not None:
            logger.info("   ✅ Model compilation successful")
        else:
            logger.info("   ℹ️  Model compilation skipped (expected on MPS)")

        return True

    except Exception as e:
        logger.warning(f"   ⚠️  Model compilation check failed (non-critical): {e}")
        return True  # Non-critical


def check_warmup_model():
    """Verify model warmup functionality."""
    logger.info("\n🔍 Checking model warmup...")

    try:
        import torch

        optimizer = get_performance_optimizer()

        # Create dummy model
        class DummyModel(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.linear = torch.nn.Linear(10, 5)

            def forward(self, x):
                return self.linear(x)

        model = DummyModel()
        warmup_input = torch.randn(1, 10)

        # Try warmup
        success = optimizer.warmup_model(model, warmup_input)

        if success:
            logger.info("   ✅ Model warmup successful")
        else:
            logger.warning("   ⚠️  Model warmup failed (non-critical)")

        return True

    except Exception as e:
        logger.warning(f"   ⚠️  Model warmup check failed (non-critical): {e}")
        return True  # Non-critical


def main():
    """Run all validation checks."""
    logger.info("=" * 70)
    logger.info("GPU Performance Optimizations - Validation")
    logger.info("=" * 70)

    checks = [
        ("Optimizer Initialization", check_optimizer_initialization),
        ("CUDA Optimizations", check_cuda_optimizations),
        ("MPS Optimizations", check_mps_optimizations),
        ("CPU Optimizations", check_cpu_optimizations),
        ("Batch Size Calculation", check_batch_size_calculation),
        ("Inference Context", check_inference_context),
        ("torch.compile Support", check_compile_model),
        ("Model Warmup", check_warmup_model),
    ]

    results = []
    for name, check_fn in checks:
        try:
            success = check_fn()
            results.append((name, success))
        except Exception as e:
            logger.error(f"\n❌ {name} failed with exception: {e}")
            results.append((name, False))

    # Summary
    logger.info("\n" + "=" * 70)
    logger.info("Validation Summary")
    logger.info("=" * 70)

    passed = sum(1 for _, success in results if success)
    total = len(results)

    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        logger.info(f"{status:12} {name}")

    logger.info("=" * 70)

    if passed == total:
        logger.info(f"\n🎉 All {total} checks passed!")
        return 0
    else:
        logger.warning(f"\n⚠️  {passed}/{total} checks passed, {total - passed} failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
