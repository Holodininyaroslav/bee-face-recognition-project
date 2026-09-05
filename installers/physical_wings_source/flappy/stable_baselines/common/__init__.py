def set_global_seeds(seed):
    try:
        import numpy as np

        np.random.seed(seed)
    except Exception:
        pass
