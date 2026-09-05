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
    print("FLAPPY_VISUAL_LIVE_STARTED", flush=True)

    i = 0
    while True:
        action = controller.get_action(obs * env.observation_bound)
        normalized = (action - env.action_lb) / (env.action_ub - env.action_lb) * 2 - 1
        obs, reward, done, info = env.step(normalized)

        if done:
            obs = env.reset()

        if i % 100 == 0:
            print("live_step={:06d} t={:.4f} reward={:.6f}".format(i, info["time"], reward), flush=True)
        i += 1


if __name__ == "__main__":
    main()
