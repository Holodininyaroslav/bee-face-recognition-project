from pathlib import Path

from panda3d.core import Filename, LoaderOptions, Material
from ursina import Entity, Grid, Vec3, application, color, load_model
from ursina.shaders import basic_lighting_shader

from config import (
    FACE_MODEL_COLOR,
    FACE_MODEL_SPECS,
    FACE_MODEL_TARGET_HEIGHT,
    GROUND_COLOR,
    GROUND_SIZE,
    GRID_CELLS,
    GRID_COLOR,
)


FACE_CACHE_DIR = Path.home() / ".ai_mips_bee_assets" / "faces"


def face_source_path(spec: dict) -> Path:
    path = Path(spec["path"])
    if path.is_absolute():
        return path
    return Path.cwd() / path


def face_cache_path(spec: dict) -> Path:
    return FACE_CACHE_DIR / f"{Path(spec['path']).stem}.bam"


class World:
    def __init__(
        self,
        parent,
        load_faces: bool = True,
        cached_faces_only: bool = False,
        use_face_cache: bool = False,
    ) -> None:
        self.root = Entity(parent=parent)
        self.cached_faces_only = cached_faces_only
        self.use_face_cache = use_face_cache
        self.face_load_in_progress = False
        self.pending_face_specs = list(FACE_MODEL_SPECS)

        self.ground = Entity(
            parent=self.root,
            model="plane",
            color=color.rgba32(*GROUND_COLOR),
            scale=(GROUND_SIZE, 1, GROUND_SIZE),
            position=(0, 0, 0),
        )

        self.grid = Entity(
            parent=self.root,
            model=Grid(GRID_CELLS, GRID_CELLS),
            color=color.rgba32(*GRID_COLOR),
            position=(0, 0.02, 0),
            rotation_x=90,
            scale=(GROUND_SIZE, GROUND_SIZE, 1),
        )

        self.face_models = []
        if load_faces:
            while self.pending_face_specs:
                self._add_face_model(self.pending_face_specs.pop(0))

    def load_ready_face_model(self) -> bool:
        if not self.pending_face_specs:
            return False

        spec = self.pending_face_specs[0]
        if self.cached_faces_only and not self._cached_face_path(spec).exists():
            return False

        self.pending_face_specs.pop(0)
        self._add_face_model(spec)
        return True

    def load_next_face_model_async(self) -> bool:
        if self.face_load_in_progress or not self.pending_face_specs:
            return False

        spec = self.pending_face_specs[0]
        if self.use_face_cache:
            cache_path = self._cached_face_path(spec)
            if cache_path.exists():
                self.pending_face_specs.pop(0)
                self._add_face_model(spec)
                return True
            if self.cached_faces_only:
                return False

        source_path = face_source_path(spec)
        if not source_path.exists():
            self.pending_face_specs.pop(0)
            print(f"Face model not found: {spec['path']}")
            return False

        self.pending_face_specs.pop(0)
        self.face_load_in_progress = True
        options = LoaderOptions(LoaderOptions.LFNoCache | LoaderOptions.LFNoRamCache)
        application.base.loader.loadModel(
            Filename.fromOsSpecific(str(source_path)),
            loaderOptions=options,
            callback=self._on_face_model_loaded,
            extraArgs=[spec],
            blocking=False,
        )
        return True

    def _on_face_model_loaded(self, model, spec: dict) -> None:
        self.face_load_in_progress = False
        if model is None or model.isEmpty():
            print(f"Face model not found: {spec['path']}")
            return
        self._create_face_entity(model, spec)

    def _add_face_model(self, spec: dict) -> None:
        cache_path = self._cached_face_path(spec)
        if self.use_face_cache and cache_path.exists():
            model = application.base.loader.loadModel(Filename.fromOsSpecific(str(cache_path)))
            if model.isEmpty():
                model = None
        elif self.cached_faces_only:
            return
        else:
            source_path = face_source_path(spec)
            if source_path.exists():
                options = LoaderOptions(LoaderOptions.LFNoCache | LoaderOptions.LFNoRamCache)
                model = application.base.loader.loadModel(
                    Filename.fromOsSpecific(str(source_path)),
                    loaderOptions=options,
                )
                if model.isEmpty():
                    model = None
            else:
                model = load_model(spec["path"])
        if model is None:
            print(f"Face model not found: {spec['path']}")
            return

        self._create_face_entity(model, spec)

    def _create_face_entity(self, model, spec: dict) -> None:
        identity_label = Path(spec["path"]).stem
        entity = Entity(
            parent=self.root,
            model=model,
            rotation=spec["rotation"],
            shader=basic_lighting_shader,
        )
        entity.identity_label = identity_label
        self._apply_face_material(entity)
        self._fit_model_to_height(entity, spec.get("target_height", FACE_MODEL_TARGET_HEIGHT))
        entity.position += Vec3(*spec["position"])
        self.face_models.append(entity)

    def _apply_face_material(self, entity: Entity) -> None:
        if FACE_MODEL_COLOR is None:
            return

        material = Material()
        material.setAmbient((0.36, 0.24, 0.19, 1.0))
        material.setDiffuse((0.74, 0.52, 0.40, 1.0))
        material.setSpecular((0.05, 0.04, 0.035, 1.0))
        material.setShininess(6.0)

        try:
            for node in [entity, *entity.findAllMatches("**/+GeomNode")]:
                node.setColor(color.rgba32(*FACE_MODEL_COLOR))
                node.setColorScale(1, 1, 1, 1)
                node.setMaterial(material, 100)
        except Exception as e:
            print(f"Could not apply face material: {e}")

    def _fit_model_to_height(self, entity: Entity, target_height: float) -> None:
        try:
            min_bounds, max_bounds = entity.get_tight_bounds()
            if min_bounds is None or max_bounds is None:
                return

            height = float(max_bounds.y - min_bounds.y)
            if height <= 0:
                return

            fit_scale = target_height / height
            center_x = (float(min_bounds.x) + float(max_bounds.x)) * 0.5
            center_z = (float(min_bounds.z) + float(max_bounds.z)) * 0.5

            entity.scale *= fit_scale
            entity.position += Vec3(
                -center_x * fit_scale,
                -float(min_bounds.y) * fit_scale,
                -center_z * fit_scale,
            )
        except Exception as e:
            print(f"Could not fit face model: {e}")

    def follow(self, x: float, z: float) -> None:
        self.ground.x = float(x)
        self.ground.z = float(z)
        self.grid.x = float(x)
        self.grid.z = float(z)

    def _cached_face_path(self, spec: dict) -> Path:
        return face_cache_path(spec)
