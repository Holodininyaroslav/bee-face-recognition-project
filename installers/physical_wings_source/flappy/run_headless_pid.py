import gym
import flappy  # noqa: F401 - registers gym environments

from flappy.envs.fwmav.controllers.pid_controller import PIDController


def main():
    env = gym.make("fwmav_hover-v0")
    env.config(random_init=False, randomize_sim=False, phantom_sensor=False)
    obs = env.reset()
    controller = PIDController(env.sim.dt_c)

    for i in range(80):
        action = controller.get_action(obs * env.observation_bound)
        normalized = (action - env.action_lb) / (env.action_ub - env.action_lb) * 2 - 1
        obs, reward, done, info = env.step(normalized)

        if i % 20 == 0 or i == 79:
            state = env.sim.states["body_positions"].reshape(-1)
            print(
                "step={:03d} t={:.4f} xyz=({:.5f},{:.5f},{:.5f}) reward={:.6f} done={}".format(
                    i,
                    info["time"],
                    state[3],
                    state[4],
                    state[5],
                    reward,
                    done,
                )
            )

    print("FLAPPY_HEADLESS_OK")


if __name__ == "__main__":
    main()
