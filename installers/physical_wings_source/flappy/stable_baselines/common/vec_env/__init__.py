import numpy as np


class DummyVecEnv:
    def __init__(self, env_fns):
        self.envs = [fn() for fn in env_fns]

    def reset(self):
        return np.asarray([env.reset() for env in self.envs])

    def step(self, actions):
        results = [env.step(action) for env, action in zip(self.envs, actions)]
        obs, rewards, dones, infos = zip(*results)
        return (
            np.asarray(obs),
            np.asarray(rewards),
            np.asarray(dones),
            list(infos),
        )


class SubprocVecEnv(DummyVecEnv):
    pass
