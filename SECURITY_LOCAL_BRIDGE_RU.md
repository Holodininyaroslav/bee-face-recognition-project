# Безопасный локальный bridge

Публичный GitHub Pages сайт не должен сам управлять программами на компьютере. Поэтому локальные действия включаются только вручную, только на одну рабочую сессию и только через приватный токен.

## Что заблокировано по умолчанию

Без приватного токена сайт не может:

- запускать локальное распознавание лиц;
- менять состояние Hive-интерфейса;
- открывать или запускать BeeBoard;
- открывать физическую симуляцию;
- запускать локальную Ursina/3D симуляцию;
- менять URL подключенного detector endpoint;
- запускать локальные приложения через браузер.

Если страница показывает `Local bridge disabled` или `Local bridge blocked`, это нормальная защита: сайт не получил явного разрешения.

## Как включить только нужное действие

Открой PowerShell в папке локального проекта и задай длинный случайный токен:

```powershell
$env:BEE_LOCAL_SECURITY="strict"
$env:BEE_LOCAL_BRIDGE_TOKEN="replace-with-a-long-private-random-token"
$env:BEE_LOCAL_ALLOWED_ACTIONS="detect_face"
python -m ai_mips_sim.server --host 127.0.0.1 --port 8876
```

После этого открывай GitHub Pages только с параметрами:

```text
https://holodininyaroslav.github.io/bee-face-recognition-project/?local_bridge=1&local_token=replace-with-a-long-private-random-token
```

## Доступные разрешения

Разрешай только то, что нужно прямо сейчас:

- `detect_face` - отправить изображение в локальный detector.
- `configure_detector` - изменить URL подключенного detector endpoint.
- `control_hive` - менять состояние локального Hive: reset, run, step, processors, links, positions, program, matrix plan.
- `open_beeboard` - открыть или запустить локальный BeeBoard.
- `open_physical` - открыть локальную физическую bee-shell/FWMAV симуляцию.
- `start_ursina` - запустить локальную Ursina/3D симуляцию.
- `start_hive` - запустить локальный Hive Web из Colab/bridge скрипта, если используется соответствующий bridge.

Можно указать несколько действий через запятую:

```powershell
$env:BEE_LOCAL_ALLOWED_ACTIONS="detect_face,control_hive,open_beeboard,open_physical"
```

## Правила безопасности

- Не публикуй `BEE_LOCAL_BRIDGE_TOKEN` в GitHub, Colab, скриншотах, сообщениях или README.
- Держи локальные серверы на `127.0.0.1`, а не на `0.0.0.0`.
- Не добавляй чужие сайты в trusted origins.
- Не включай лишние действия в `BEE_LOCAL_ALLOWED_ACTIONS`.
- После работы закрывай локальные Python-серверы или запускай новый токен для следующей сессии.
- После работы очищай переменные окружения:

```powershell
Remove-Item Env:BEE_LOCAL_BRIDGE_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:BEE_LOCAL_ALLOWED_ACTIONS -ErrorAction SilentlyContinue
```

## Текущая модель защиты

Локальный сервер проверяет:

- что запрос пришел с доверенного Origin;
- что `local_token` совпадает с приватным токеном текущей сессии;
- что действие входит в `BEE_LOCAL_ALLOWED_ACTIONS`;
- что сервис слушает локальный loopback адрес.

Публичная страница дополнительно удаляет `local_token` из видимой адресной строки после загрузки и использует `referrer=no-referrer`, чтобы токен случайно не уходил при переходе по ссылкам.
