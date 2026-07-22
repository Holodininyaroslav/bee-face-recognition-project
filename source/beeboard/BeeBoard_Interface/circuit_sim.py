from __future__ import annotations

from dataclasses import asdict, dataclass
from math import isfinite
from typing import Any


@dataclass
class BeeBoardInputs:
    supercap_voltage: float = 3.8
    supercap_esr_ohm: float = 0.18
    bio_input_voltage: float = 0.55
    bio_input_current_ma: float = 8.0
    fpga_activity: float = 0.45
    lifi_tx_duty: float = 0.08
    imu_rate_hz: float = 200.0
    wing_driver_current_ma: float = 24.0
    spring_driver_current_ma: float = 0.0
    drill_driver_current_ma: float = 0.0
    camera_enabled: bool = False
    dash_requested: bool = False


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _status(v_loaded: float, inputs: BeeBoardInputs) -> list[str]:
    if v_loaded >= 3.35:
        result = ["NORMAL"]
    elif v_loaded >= 2.65:
        result = ["LOW_POWER"]
    else:
        result = ["SURVIVAL_MODE"]

    if inputs.dash_requested and inputs.spring_driver_current_ma > 0 and v_loaded >= 3.55:
        result.append("READY_FOR_DASH")
    else:
        result.append("NO_DASH")

    if v_loaded < 3.0:
        result.append("FIND_PLASTIC")
    if v_loaded < 2.4:
        result.append("SLEEP")
    if inputs.drill_driver_current_ma > 0 and v_loaded < 3.3:
        result.append("DRILL_BLOCKED_LOW_POWER")
    return result


def simulate(inputs: BeeBoardInputs) -> dict[str, Any]:
    """Board-level estimate for BeeBoard v0.1 rails and loads.

    This is not a transistor-level SPICE model. It is a fast prototype model
    for checking whether a proposed flight/actuator mode fits inside the
    supercapacitor and harvester power budget.
    """

    v_cap = clamp(inputs.supercap_voltage, 0.1, 5.5)
    esr = clamp(inputs.supercap_esr_ohm, 0.01, 5.0)
    bio_v = clamp(inputs.bio_input_voltage, 0.0, 2.0)
    bio_i_ma = clamp(inputs.bio_input_current_ma, 0.0, 100.0)
    activity = clamp(inputs.fpga_activity, 0.0, 1.0)
    lifi_duty = clamp(inputs.lifi_tx_duty, 0.0, 1.0)
    imu_rate = clamp(inputs.imu_rate_hz, 0.0, 1600.0)

    i_1v2_ma = 5.0 + 42.0 * activity
    p_1v2_mw = 1.2 * i_1v2_ma

    i_flash_ma = 0.6 + 1.8 * activity
    i_imu_ma = 0.55 + 0.0025 * imu_rate
    i_lifi_rx_ma = 1.2
    i_lifi_tx_ma = 28.0 * lifi_duty
    i_camera_ma = 18.0 if inputs.camera_enabled else 0.0
    i_fpga_io_ma = 3.0 + 8.0 * activity
    i_3v3_ma = i_flash_ma + i_imu_ma + i_lifi_rx_ma + i_lifi_tx_ma + i_camera_ma + i_fpga_io_ma
    p_3v3_mw = 3.3 * i_3v3_ma

    i_act_ma = (
        max(0.0, inputs.wing_driver_current_ma)
        + max(0.0, inputs.spring_driver_current_ma)
        + max(0.0, inputs.drill_driver_current_ma)
    )
    p_act_mw = v_cap * i_act_ma

    p_reg_input_mw = p_1v2_mw / 0.84 + p_3v3_mw / 0.88
    i_reg_input_ma = p_reg_input_mw / max(v_cap, 0.1)
    i_cap_load_ma = i_reg_input_ma + i_act_ma
    v_cap_loaded = max(0.0, v_cap - (i_cap_load_ma / 1000.0) * esr)

    bio_power_mw = bio_v * bio_i_ma
    system_power_mw = p_reg_input_mw + p_act_mw
    net_power_mw = bio_power_mw - system_power_mw

    cap_farads = 0.010
    stored_j = 0.5 * cap_farads * v_cap_loaded * v_cap_loaded
    if net_power_mw < 0:
        runtime_s = stored_j * 1000.0 / max(system_power_mw - bio_power_mw, 0.001)
    else:
        runtime_s = float("inf")

    rails = [
        {
            "name": "Supercap raw",
            "voltage_v": round(v_cap_loaded, 3),
            "current_ma": round(i_cap_load_ma, 2),
            "power_mw": round(system_power_mw, 2),
        },
        {
            "name": "FPGA core 1V2",
            "voltage_v": 1.2,
            "current_ma": round(i_1v2_ma, 2),
            "power_mw": round(p_1v2_mw, 2),
        },
        {
            "name": "IO/sensors 3V3",
            "voltage_v": 3.3,
            "current_ma": round(i_3v3_ma, 2),
            "power_mw": round(p_3v3_mw, 2),
        },
        {
            "name": "Actuator bus",
            "voltage_v": round(v_cap_loaded, 3),
            "current_ma": round(i_act_ma, 2),
            "power_mw": round(p_act_mw, 2),
        },
        {
            "name": "Bio input",
            "voltage_v": round(bio_v, 3),
            "current_ma": round(bio_i_ma, 2),
            "power_mw": round(bio_power_mw, 2),
        },
    ]

    measurements = {
        "supercap_loaded_v": round(v_cap_loaded, 3),
        "supercap_current_ma": round(i_cap_load_ma, 2),
        "system_power_mw": round(system_power_mw, 2),
        "bio_power_mw": round(bio_power_mw, 2),
        "net_power_mw": round(net_power_mw, 2),
        "stored_energy_j": round(stored_j, 4),
        "estimated_runtime_s": "charging" if not isfinite(runtime_s) else round(runtime_s, 2),
    }

    return {
        "inputs": asdict(inputs),
        "status": _status(v_cap_loaded, inputs),
        "rails": rails,
        "measurements": measurements,
    }


def from_query(params: dict[str, str]) -> BeeBoardInputs:
    def f(name: str, default: float) -> float:
        try:
            return float(params.get(name, default))
        except (TypeError, ValueError):
            return default

    def b(name: str, default: bool) -> bool:
        raw = str(params.get(name, default)).lower()
        return raw in {"1", "true", "yes", "on"}

    return BeeBoardInputs(
        supercap_voltage=f("supercap_voltage", 3.8),
        supercap_esr_ohm=f("supercap_esr_ohm", 0.18),
        bio_input_voltage=f("bio_input_voltage", 0.55),
        bio_input_current_ma=f("bio_input_current_ma", 8.0),
        fpga_activity=f("fpga_activity", 0.45),
        lifi_tx_duty=f("lifi_tx_duty", 0.08),
        imu_rate_hz=f("imu_rate_hz", 200.0),
        wing_driver_current_ma=f("wing_driver_current_ma", 24.0),
        spring_driver_current_ma=f("spring_driver_current_ma", 0.0),
        drill_driver_current_ma=f("drill_driver_current_ma", 0.0),
        camera_enabled=b("camera_enabled", False),
        dash_requested=b("dash_requested", False),
    )
