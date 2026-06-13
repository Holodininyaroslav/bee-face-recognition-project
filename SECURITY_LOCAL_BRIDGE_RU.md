# Безопасный локальный bridge

Публичный GitHub Pages сайт не должен сам управлять программами на компьютере. Поэтому локальные действия включаются только вручную и только на одну рабочую сессию.

## Что заблокировано по умолчанию

- Запуск локального распознавания лиц с сайта.
- Открытие или запуск BeeBoard.
- Открытие локальной Ursina/3D симуляции.
- Открытие физической симуляции крыльев.
- Любой запуск локальной программы без приватного токена.

## Как включить только нужное действие

Открой PowerShell в папке проекта и задай длинный приватный токен:

```powershell
$env:BEE_LOCAL_BRIDGE_TOKEN="replace-with-a-long-private-random-token"
$env:BEE_LOCAL_ALLOWED_ACTIONS="detect_face"
python -m ai_mips_sim.server --host 127.0.0.1 --port 8876
```

После этого открывай GitHub Pages только с параметрами:

```text
https://holodininyaroslav.github.io/bee-face-recognition-project/?local_bridge=1&local_token=replace-with-a-long-private-random-token
```

## Разрешения

Разрешай только то, что нужно прямо сейчас:

- `detect_face` - отправка изображения в локальный detector.
- `open_beeboard` - открыть или запустить локальный BeeBoard.
- `start_ursina` - запустить локальную Ursina/3D симуляцию.
- `open_physical` - открыть локальную физическую симуляцию крыльев.
- `start_hive` - запуск локального Hive Web из Colab/bridge скрипта.

Можно указать несколько действий через запятую:

```powershell
$env:BEE_LOCAL_ALLOWED_ACTIONS="detect_face,open_beeboard"
```

## Правила безопасности

- Не публикуй `BEE_LOCAL_BRIDGE_TOKEN` в GitHub, Colab, скриншотах или сообщениях.
- Держи локальные серверы на `127.0.0.1`, не на `0.0.0.0`.
- Не добавляй чужие сайты в trusted origins.
- После работы закрывай локальные Python-серверы.
- После работы очищай переменные:

```powershell
Remove-Item Env:BEE_LOCAL_BRIDGE_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:BEE_LOCAL_ALLOWED_ACTIONS -ErrorAction SilentlyContinue
```

Если страница показывает `Local bridge disabled` или `Local bridge blocked`, это нормальная защита: сайт не получил явного разрешения на локальное действие.
