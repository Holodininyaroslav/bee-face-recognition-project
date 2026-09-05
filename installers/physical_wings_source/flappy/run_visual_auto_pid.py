import os
import time

import gym
import flappy  # noqa: F401 - registers gym environments

from flappy.envs.fwmav.controllers.pid_controller import PIDController


def main():
    env = gym.make("fwmav_hover-v0")
    env.config(random_init=False, randomize_sim=False, phantom_sensor=False)
    env.enable_visualization()
    env.enable_print()
    obs = env.reset()
    controller = PIDController(env.sim.dt_c)

    time.sleep(1.0)
    env.is_sim_on = True

    for i in range(50):
        action = controller.get_action(obs * env.observation_bound)
        normalized = (action - env.action_lb) / (env.action_ub - env.action_lb) * 2 - 1
        obs, reward, done, info = env.step(normalized)
        if i % 10 == 0 or i == 49:
            print(
                "visual_step={:03d} t={:.4f} reward={:.6f}".format(
                    i, info["time"], reward
                ),
                flush=True,
            )

    print("FLAPPY_VISUAL_XVFB_OK", flush=True)
    os._exit(0)


if __name__ == "__main__":
    main()
