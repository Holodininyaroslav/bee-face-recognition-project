from pathlib import Path

from panda3d.core import Filename, LoaderOptions
from ursina import Ursina, application, load_model

from config import FACE_MODEL_SPECS
from drone_model import DroneModel
from world import FACE_CACHE_DIR, face_cache_path, face_source_path


def warm_bee_model() -> None:
    from ursina import Entity

    root = Entity()
    DroneModel(root, load_extra_characters=False)


def warm_face_models() -> None:
    FACE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for spec in FACE_MODEL_SPECS:
        source_path = face_source_path(spec)
        cache_path = face_cache_path(spec)
        if not source_path.exists():
            print(f"Face source missing: {source_path}")
            continue
        if cache_path.exists() and cache_path.stat().st_mtime >= source_path.stat().st_mtime:
            continue

        options = LoaderOptions(LoaderOptions.LFNoCache | LoaderOptions.LFNoRamCache)
        model = application.base.loader.loadModel(
            Filename.fromOsSpecific(str(source_path)),
            loaderOptions=options,
        )
        if model.isEmpty():
            model = load_model(spec["path"])
        if model is None or getattr(model, "isEmpty", lambda: False)():
            print(f"Could not warm face model: {spec['path']}")
            continue

        model.writeBamFile(Filename.fromOsSpecific(str(cache_path)))
        print(f"Warmed face model: {cache_path}")


def main() -> None:
    app = Ursina(window_type="offscreen")
    warm_bee_model()
    application.quit()
    app.destroy()


if __name__ == "__main__":
    main()
