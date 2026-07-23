import json
import os
import shutil
import struct
from pathlib import Path

from direct.actor.Actor import Actor
from panda3d.core import Filename, TransparencyAttrib, getModelPath
from ursina import Entity, Vec3, color, load_model

from config import (
    BEE_CHARACTER_ENABLED,
    DRONE_ANIMATION_KEYS,
    DRONE_MODEL_PATH,
    DRONE_MODEL_ROTATION,
    DRONE_MODEL_TARGET_SIZE,
    HUMAN_ANIMATION_FRAME_ENABLED,
    HUMAN_ANIMATION_FRAME_DIR,
    HUMAN_ANIMATION_FRAME_PATTERN,
    HUMAN_ANIMATION_FRAME_RATE,
    HUMAN_ANIMATION_NAME,
    HUMAN_IDLE_ANIMATION_NAME,
    HUMAN_MODEL_COLOR_SCALE,
    HUMAN_MODEL_PATH,
    HUMAN_MODEL_ROTATION,
    HUMAN_MODEL_TARGET_SIZE,
    MAN_ANIMATION_FRAME_ENABLED,
    MAN_ANIMATION_FRAME_DIR,
    MAN_ANIMATION_FRAME_PATTERN,
    MAN_ANIMATION_FRAME_RATE,
    MAN_MODEL_COLOR_SCALE,
    MAN_MODEL_PATH,
    MAN_MODEL_ROTATION,
    MAN_MODEL_TARGET_SIZE,
    START_CHARACTER,
)


class DroneModel:
    def __init__(
        self,
        parent,
        model_path: Path | str = DRONE_MODEL_PATH,
        load_extra_characters: bool = True,
    ) -> None:
        self.parent = parent
        self.model_path = Path(model_path)
        self.load_model_path = self._ensure_pbr_model_cache()
        self.load_model_path = self._ensure_loader_safe_model_path(self.load_model_path)
        self.load_model_name = self._model_name_for_loader(self.load_model_path)
        self.root = Entity(parent=self.parent, name="drone_root")
        self.visual_root = Entity(parent=self.root, name="drone_visual")
        self.human_visual_root = Entity(parent=self.root, name="human_visual", enabled=False)
        self.man_visual_root = Entity(parent=self.root, name="man_visual", enabled=False)
        self.loaded_kind = "fallback"
        self.actor = None
        self.human_actor = None
        self.human_static_model = None
        self.human_frame_entities = []
        self.human_frame_index = 0
        self.human_frame_timer = 0.0
        self.human_available = False
        self.man_static_model = None
        self.man_frame_entities = []
        self.man_frame_index = 0
        self.man_frame_timer = 0.0
        self.man_available = False
        self.human_idle_animation_name = ""
        self.human_animation_name = ""
        self.human_animation_playing = False
        self.active_character = "bee"
        self.current_animation = ""
        self.base_visual_scale = Vec3(1, 1, 1)

        if self.model_path.exists() and self._try_load_model():
            self.loaded_kind = "actor" if self.actor is not None else "entity"
            self.play_animation_key("8")
        else:
            if not self.model_path.exists():
                print(f"Model file not found: {self.model_path}")
            self._build_fallback()

        if load_extra_characters:
            self._try_load_human_model()
            self._try_load_man_model()
        self._apply_start_character()

    def _apply_start_character(self) -> None:
        if START_CHARACTER in {"beetle", "human"} and self.human_available:
            self._activate_character("beetle")
            return
        if START_CHARACTER == "man" and self.man_available:
            self._activate_character("man")
            return

        self._activate_character("bee")

    def _activate_character(self, character: str) -> None:
        if character == "beetle" and not self.human_available:
            character = "bee"
        if character == "man" and not self.man_available:
            character = "bee"

        self.active_character = character
        self.visual_root.enabled = character == "bee"
        self.human_visual_root.enabled = character == "beetle"
        self.man_visual_root.enabled = character == "man"
        self._set_human_walking(False)
        self._set_man_walking(False)
        if character == "bee":
            self.play_animation_key("8")
        elif character == "beetle":
            self.current_animation = "beetle_still"
        elif character == "man":
            self.current_animation = "man_still"

    def _try_load_model(self) -> bool:
        try:
            self.visual_root.rotation = Vec3(*DRONE_MODEL_ROTATION)
            self.actor = Actor(self.load_model_name)
            self.actor.reparentTo(self.visual_root)
            self._restore_bee_color(self.actor)
            self.actor.setTransparency(TransparencyAttrib.M_alpha)
            self._pose_start_frame()
            self._fit_model_to_scene(self.visual_root)
            self._anchor_to_root()
            self._remember_base_scale()
            print("Loaded animated .glb model")
            return True
        except Exception as e:
            print(f"Animated model load failed: {e}")
            self.actor = None
            return self._try_load_static_model()

    def _pose_start_frame(self) -> None:
        if self.actor is None:
            return

        anim_names = self.actor.getAnimNames()
        if not anim_names:
            return

        animation_name = DRONE_ANIMATION_KEYS.get("8")
        if animation_name not in anim_names:
            animation_name = anim_names[0]

        self.actor.pose(animation_name, 0)
        self.current_animation = animation_name

    def _try_load_static_model(self) -> bool:
        model = load_model(self.load_model_name)
        if model is None:
            return False

        self.visual_root.rotation = Vec3(*DRONE_MODEL_ROTATION)
        entity = Entity(
            parent=self.visual_root,
            model=model,
        )
        self._restore_bee_color(entity)
        self._fit_model_to_scene(self.visual_root)
        self._remember_base_scale()
        print("Loaded static .glb model")
        return True

    def _restore_bee_color(self, entity) -> None:
        try:
            for node in [entity, *entity.findAllMatches("**/+GeomNode")]:
                node.setColorScale(1, 1, 1, 1)
                node.setLightOff(1)
        except Exception as e:
            print(f"Could not restore bee colors: {e}")

    def _try_load_human_model(self) -> bool:
        if not HUMAN_MODEL_PATH.exists():
            print(f"Human model file not found: {HUMAN_MODEL_PATH}")
            return False

        try:
            load_name = self._model_name_for_loader(HUMAN_MODEL_PATH)
            self.human_visual_root.rotation = Vec3(*HUMAN_MODEL_ROTATION)
            model = load_model(load_name)
            if model is None:
                raise ValueError(f"Could not load human model: {HUMAN_MODEL_PATH}")

            self.human_static_model = Entity(
                parent=self.human_visual_root,
                model=model,
            )
            self.human_static_model.setColorScale(*HUMAN_MODEL_COLOR_SCALE)
            self._make_human_opaque(self.human_static_model)
            self._fit_model_to_scene(self.human_visual_root, HUMAN_MODEL_TARGET_SIZE)
            self._anchor_entity_to_root(self.human_visual_root, HUMAN_MODEL_TARGET_SIZE)
            self._pose_human_start_frame()
            self.human_available = True
            print(f"Loaded playable beetle model: {HUMAN_MODEL_PATH}")
            return True
        except Exception as e:
            print(f"Human model load failed: {e}")
            self.human_actor = None
            self.human_static_model = None
            self.human_frame_entities = []
            self.human_available = False
            self.human_visual_root.enabled = False
            return False

    def _try_load_man_model(self) -> bool:
        if not MAN_MODEL_PATH.exists():
            print(f"Man model file not found: {MAN_MODEL_PATH}")
            return False

        try:
            load_name = self._model_name_for_loader(MAN_MODEL_PATH)
            self.man_visual_root.rotation = Vec3(*MAN_MODEL_ROTATION)
            model = load_model(load_name)
            if model is None:
                raise ValueError(f"Could not load man model: {MAN_MODEL_PATH}")

            self.man_static_model = Entity(
                parent=self.man_visual_root,
                model=model,
            )
            self.man_static_model.setColorScale(*MAN_MODEL_COLOR_SCALE)
            self._make_human_opaque(self.man_static_model)
            self._fit_model_to_scene(self.man_visual_root, MAN_MODEL_TARGET_SIZE)
            self._anchor_entity_to_root(self.man_visual_root, MAN_MODEL_TARGET_SIZE)
            self.man_available = True
            print(f"Loaded playable man model: {MAN_MODEL_PATH}")
            return True
        except Exception as e:
            print(f"Man model load failed: {e}")
            self.man_static_model = None
            self.man_frame_entities = []
            self.man_available = False
            self.man_visual_root.enabled = False
            return False

    def _load_monolithic_animation_frames(
        self,
        parent: Entity,
        static_model: Entity,
        frame_dir: Path,
        frame_pattern: str,
        color_scale,
    ) -> list[Entity]:
        if not frame_dir.exists():
            return []

        frame_paths = sorted(frame_dir.glob(frame_pattern))
        if not frame_paths:
            return []

        frame_entities = []
        for frame_path in frame_paths:
            model = load_model(self._model_name_for_loader(frame_path))
            if model is None:
                continue

            frame = Entity(
                parent=parent,
                model=model,
                enabled=False,
            )
            frame.position = static_model.position
            frame.rotation = static_model.rotation
            frame.scale = static_model.scale
            frame.setColorScale(*color_scale)
            self._make_human_opaque(frame)
            frame_entities.append(frame)

        if frame_entities:
            print(f"Loaded monolithic animation frames: {len(frame_entities)} from {frame_dir}")
        return frame_entities

    def _make_human_opaque(self, target=None) -> None:
        target = target or self.human_actor
        if target is None:
            return

        target.clearTransparency()
        target.setDepthTest(True)
        target.setDepthWrite(True)
        target.setBin("opaque", 0)

        for node in target.findAllMatches("**/+GeomNode"):
            node.clearTransparency()
            node.setDepthTest(True)
            node.setDepthWrite(True)
            node.setBin("opaque", 0)

    def _pose_human_start_frame(self) -> None:
        if self.human_actor is None:
            self.current_animation = "human_still"
            return

        anim_names = self.human_actor.getAnimNames()
        if not anim_names:
            return

        self.human_idle_animation_name = (
            HUMAN_IDLE_ANIMATION_NAME if HUMAN_IDLE_ANIMATION_NAME in anim_names else anim_names[0]
        )
        self.human_animation_name = (
            HUMAN_ANIMATION_NAME
            if HUMAN_ANIMATION_NAME in anim_names
            else anim_names[-1]
        )
        self.human_actor.pose(self.human_idle_animation_name, 0)
        self.current_animation = "human_still"

    def _ensure_pbr_model_cache(self) -> Path:
        cache_path = self.model_path.with_name(f"{self.model_path.stem}_pbr.glb")
        try:
            if cache_path.exists() and cache_path.stat().st_mtime >= self.model_path.stat().st_mtime:
                return cache_path

            data = self.model_path.read_bytes()
            magic, _version, _length = struct.unpack_from("<4sII", data, 0)
            if magic != b"glTF":
                return self.model_path

            offset = 12
            json_length, json_type = struct.unpack_from("<II", data, offset)
            offset += 8
            if json_type != 0x4E4F534A:
                return self.model_path

            gltf_json = json.loads(data[offset : offset + json_length].decode("utf-8"))
            offset += json_length

            bin_length, bin_type = struct.unpack_from("<II", data, offset)
            offset += 8
            if bin_type != 0x004E4942:
                return self.model_path

            bin_chunk = data[offset : offset + bin_length]
            converted = False
            for material in gltf_json.get("materials", []):
                spec_gloss = (
                    material.get("extensions", {})
                    .get("KHR_materials_pbrSpecularGlossiness", {})
                )
                diffuse_texture = spec_gloss.get("diffuseTexture")
                if diffuse_texture is None:
                    continue

                material["pbrMetallicRoughness"] = {
                    "baseColorTexture": diffuse_texture,
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.8,
                }
                material.pop("extensions", None)
                converted = True

            if not converted:
                return self.model_path

            extensions_used = [
                extension
                for extension in gltf_json.get("extensionsUsed", [])
                if extension != "KHR_materials_pbrSpecularGlossiness"
            ]
            if extensions_used:
                gltf_json["extensionsUsed"] = extensions_used
            else:
                gltf_json.pop("extensionsUsed", None)

            json_bytes = json.dumps(gltf_json, separators=(",", ":")).encode("utf-8")
            json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
            total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_chunk)

            cache_path.write_bytes(
                struct.pack("<4sII", b"glTF", 2, total_length)
                + struct.pack("<II", len(json_bytes), 0x4E4F534A)
                + json_bytes
                + struct.pack("<II", len(bin_chunk), 0x004E4942)
                + bin_chunk
            )
            return cache_path
        except Exception as e:
            print(f"Could not build PBR model cache: {e}")
            return self.model_path

    def _model_name_for_loader(self, path: Path) -> str:
        resolved = path.resolve()
        try:
            return resolved.relative_to(Path.cwd().resolve()).as_posix()
        except ValueError:
            model_path = getModelPath()
            directory = Filename.fromOsSpecific(str(resolved.parent))
            model_path.appendDirectory(directory)
            return resolved.name

    def _ensure_loader_safe_model_path(self, path: Path) -> Path:
        resolved = Path(path).resolve()

        cache_dir = self._loader_safe_cache_dir()
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = cache_dir / f"ai_mips_unique_{resolved.name}"

        try:
            if (
                not cache_path.exists()
                or cache_path.stat().st_mtime < resolved.stat().st_mtime
            ):
                self._write_loader_safe_glb_copy(resolved, cache_path)
            return cache_path.resolve()
        except Exception as e:
            print(f"Could not prepare safe bee model cache: {e}")
            return resolved

    def _write_loader_safe_glb_copy(self, source: Path, destination: Path) -> None:
        data = source.read_bytes()
        try:
            magic, version, _length = struct.unpack_from("<4sII", data, 0)
            if magic != b"glTF":
                shutil.copy2(source, destination)
                return

            offset = 12
            chunks: list[tuple[int, bytes]] = []
            while offset + 8 <= len(data):
                chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
                offset += 8
                chunk_data = data[offset : offset + chunk_length]
                offset += chunk_length

                if chunk_type == 0x4E4F534A:
                    gltf_json = json.loads(chunk_data.decode("utf-8"))
                    prefix = f"ai_mips_bee_{source.stem}"
                    for index, image in enumerate(gltf_json.get("images", [])):
                        image["name"] = f"{prefix}_image_{index}"
                    for index, texture in enumerate(gltf_json.get("textures", [])):
                        texture["name"] = f"{prefix}_texture_{index}"
                    for index, material in enumerate(gltf_json.get("materials", [])):
                        material["name"] = f"{prefix}_material_{index}"
                    chunk_data = json.dumps(gltf_json, separators=(",", ":")).encode("utf-8")
                    chunk_data += b" " * ((4 - len(chunk_data) % 4) % 4)

                chunks.append((chunk_type, chunk_data))

            total_length = 12 + sum(8 + len(chunk_data) for _chunk_type, chunk_data in chunks)
            destination.write_bytes(
                struct.pack("<4sII", magic, version, total_length)
                + b"".join(
                    struct.pack("<II", len(chunk_data), chunk_type) + chunk_data
                    for chunk_type, chunk_data in chunks
                )
            )
        except Exception:
            shutil.copy2(source, destination)

    def _loader_safe_cache_dir(self) -> Path:
        candidates = [
            Path.home() / ".ai_mips_bee_assets",
            Path(os.environ.get("LOCALAPPDATA", "")) / "AIMipsBeeAssets",
            Path(os.environ.get("TEMP", "")) / "AIMipsBeeAssets",
            Path("C:/AIMipsBeeAssets"),
        ]

        for candidate in candidates:
            if str(candidate) and " " not in str(candidate):
                return candidate

        return Path("C:/AIMipsBeeAssets")

    def _fit_model_to_scene(self, entity: Entity, target_size: float = DRONE_MODEL_TARGET_SIZE) -> None:
        try:
            min_bounds, max_bounds = entity.get_tight_bounds()
            if min_bounds is None or max_bounds is None:
                return

            size_x = float(max_bounds.x - min_bounds.x)
            size_y = float(max_bounds.y - min_bounds.y)
            size_z = float(max_bounds.z - min_bounds.z)
            largest_side = max(size_x, size_y, size_z)
            if largest_side <= 0:
                return

            fit_scale = target_size / largest_side
            center_x = (float(min_bounds.x) + float(max_bounds.x)) * 0.5
            center_z = (float(min_bounds.z) + float(max_bounds.z)) * 0.5

            entity.scale = fit_scale
            entity.position = Vec3(
                -center_x * fit_scale,
                -float(min_bounds.y) * fit_scale,
                -center_z * fit_scale,
            )
        except Exception as e:
            print(f"Auto-scale failed for drone model: {e}")

    def _build_fallback(self) -> None:
        Entity(
            parent=self.visual_root,
            model="cube",
            color=color.dark_gray,
            scale=(0.8, 0.18, 0.8),
            y=0.0,
        )

        Entity(parent=self.visual_root, model="cube", color=color.gray, scale=(1.4, 0.04, 0.08))
        Entity(parent=self.visual_root, model="cube", color=color.gray, scale=(0.08, 0.04, 1.4))

        for x, z in ((0.65, 0.0), (-0.65, 0.0), (0.0, 0.65), (0.0, -0.65)):
            prop = Entity(
                parent=self.visual_root,
                model="cylinder",
                color=color.light_gray,
                scale=(0.18, 0.02, 0.18),
                x=x,
                z=z,
                y=0.08,
                rotation_x=90,
            )
            prop.name = "propeller"

    def play_animation_key(self, key: str) -> None:
        if self.actor is None:
            return

        anim_names = self.actor.getAnimNames()
        if not anim_names:
            return

        animation_name = DRONE_ANIMATION_KEYS.get(key)
        if animation_name not in anim_names:
            fallback_index = max(0, min(int(key) - 7, len(anim_names) - 1))
            animation_name = anim_names[fallback_index]

        if animation_name == self.current_animation:
            return

        self.actor.stop()
        self.actor.loop(animation_name)
        self.current_animation = animation_name
        self._anchor_to_root()
        self._remember_base_scale()

    def toggle_character(self) -> str:
        if not BEE_CHARACTER_ENABLED:
            if self.human_available:
                self._activate_character("beetle")
            return self.active_character

        characters = ["bee"]
        if self.human_available:
            characters.append("beetle")
        if self.man_available:
            characters.append("man")

        current_index = characters.index(self.active_character) if self.active_character in characters else 0
        self._activate_character(characters[(current_index + 1) % len(characters)])

        return self.active_character

    def _play_human_walk(self) -> None:
        self._set_human_walking(True)

    def _ensure_human_frames_loaded(self) -> None:
        if not HUMAN_ANIMATION_FRAME_ENABLED:
            return
        if self.human_frame_entities or self.human_static_model is None:
            return
        self.human_frame_entities = self._load_monolithic_animation_frames(
            self.human_visual_root,
            self.human_static_model,
            HUMAN_ANIMATION_FRAME_DIR,
            HUMAN_ANIMATION_FRAME_PATTERN,
            HUMAN_MODEL_COLOR_SCALE,
        )

    def _ensure_man_frames_loaded(self) -> None:
        if not MAN_ANIMATION_FRAME_ENABLED:
            return
        if self.man_frame_entities or self.man_static_model is None:
            return
        self.man_frame_entities = self._load_monolithic_animation_frames(
            self.man_visual_root,
            self.man_static_model,
            MAN_ANIMATION_FRAME_DIR,
            MAN_ANIMATION_FRAME_PATTERN,
            MAN_MODEL_COLOR_SCALE,
        )

    def _set_human_walking(self, walking: bool) -> None:
        if self.human_actor is None:
            if walking and HUMAN_ANIMATION_FRAME_ENABLED:
                self._ensure_human_frames_loaded()
            if walking and self.human_frame_entities:
                self.human_static_model.enabled = False
                self.human_frame_entities[self.human_frame_index].enabled = True
                self.current_animation = "beetle_walk_frames"
            elif walking:
                if self.human_static_model is not None:
                    self.human_static_model.enabled = True
                self.current_animation = "beetle_walk_static"
            else:
                self._show_human_still_frame()
                if self.active_character == "beetle":
                    self.current_animation = "beetle_still"
            return

        if self.human_actor is None or not self.human_animation_name:
            return

        if walking:
            if not self.human_animation_playing:
                self.human_actor.loop(self.human_animation_name)
                self.human_animation_playing = True
            self.current_animation = self.human_animation_name
            return

        if self.human_animation_playing:
            self.human_actor.stop(self.human_animation_name)
            self.human_animation_playing = False
        if self.human_idle_animation_name:
            self.human_actor.pose(self.human_idle_animation_name, 0)
        self.current_animation = "human_still"

    def _set_man_walking(self, walking: bool) -> None:
        if self.man_static_model is None:
            return
        if walking and MAN_ANIMATION_FRAME_ENABLED:
            self._ensure_man_frames_loaded()
        if walking and self.man_frame_entities:
            self.man_static_model.enabled = False
            self.man_frame_entities[self.man_frame_index].enabled = True
            self.current_animation = "man_walk_frames"
        else:
            self._show_man_still_frame()

    def set_boundary_contact(self, touching_boundary: bool) -> None:
        if self.active_character != "bee":
            return
        self.play_animation_key("7" if touching_boundary else "8")

    def _anchor_to_root(self) -> None:
        self._anchor_entity_to_root(self.visual_root, DRONE_MODEL_TARGET_SIZE)

    def _anchor_entity_to_root(self, entity: Entity, target_size: float) -> None:
        try:
            min_bounds, max_bounds = entity.get_tight_bounds()
            if min_bounds is None or max_bounds is None:
                return

            size_x = float(max_bounds.x - min_bounds.x)
            size_y = float(max_bounds.y - min_bounds.y)
            size_z = float(max_bounds.z - min_bounds.z)
            largest_side = max(size_x, size_y, size_z)
            if largest_side > 0 and (
                largest_side < target_size * 0.7
                or largest_side > target_size * 1.6
            ):
                entity.scale *= target_size / largest_side
                min_bounds, max_bounds = entity.get_tight_bounds()
                if min_bounds is None or max_bounds is None:
                    return

            center_x = (float(min_bounds.x) + float(max_bounds.x)) * 0.5
            center_z = (float(min_bounds.z) + float(max_bounds.z)) * 0.5
            entity.x -= center_x
            entity.y -= float(min_bounds.y)
            entity.z -= center_z
        except Exception as e:
            print(f"Model anchor failed: {e}")

    def update_animation(self, dt: float, moving: bool = False) -> None:
        if self.active_character == "beetle":
            self._set_human_walking(moving)
            if moving:
                self._advance_human_frame_animation(dt)
            return

        if self.active_character == "man":
            self._set_man_walking(moving)
            if moving:
                self._advance_man_frame_animation(dt)
            return

        if self.active_character == "bee" and self.loaded_kind == "fallback":
            for child in self.visual_root.children:
                if getattr(child, "name", "") == "propeller":
                    child.rotation_y += 900 * dt

    def _remember_base_scale(self) -> None:
        self.base_visual_scale = Vec3(
            float(self.visual_root.scale_x),
            float(self.visual_root.scale_y),
            float(self.visual_root.scale_z),
        )

    def apply_pose(self, x: float, y: float, z: float, yaw_deg: float) -> None:
        self.root.position = Vec3(float(x), float(y), float(z))
        self.root.rotation_y = float(yaw_deg)

    def _show_human_still_frame(self) -> None:
        if self.human_static_model is not None:
            self.human_static_model.enabled = True
        for frame in self.human_frame_entities:
            frame.enabled = False
        self.human_frame_index = 0
        self.human_frame_timer = 0.0
        self.current_animation = "beetle_still"

    def _advance_human_frame_animation(self, dt: float) -> None:
        if not self.human_frame_entities:
            return

        self.human_frame_timer += dt
        frame_duration = 1.0 / max(1.0, HUMAN_ANIMATION_FRAME_RATE)
        if self.human_frame_timer < frame_duration:
            return

        self.human_frame_timer %= frame_duration
        self.human_frame_entities[self.human_frame_index].enabled = False
        self.human_frame_index = (self.human_frame_index + 1) % len(self.human_frame_entities)
        self.human_frame_entities[self.human_frame_index].enabled = True

    def _show_man_still_frame(self) -> None:
        if self.man_static_model is not None:
            self.man_static_model.enabled = True
        for frame in self.man_frame_entities:
            frame.enabled = False
        self.man_frame_index = 0
        self.man_frame_timer = 0.0
        self.current_animation = "man_still"

    def _advance_man_frame_animation(self, dt: float) -> None:
        if not self.man_frame_entities:
            return

        self.man_frame_timer += dt
        frame_duration = 1.0 / max(1.0, MAN_ANIMATION_FRAME_RATE)
        if self.man_frame_timer < frame_duration:
            return

        self.man_frame_timer %= frame_duration
        self.man_frame_entities[self.man_frame_index].enabled = False
        self.man_frame_index = (self.man_frame_index + 1) % len(self.man_frame_entities)
        self.man_frame_entities[self.man_frame_index].enabled = True
