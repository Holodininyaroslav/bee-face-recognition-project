"""Small compatibility shim for running Flappy's built-in PID/ARC demos.

The original project imports stable_baselines even when no RL model is used.
This shim provides only the pieces needed by test.py/test_simple.py.
"""
