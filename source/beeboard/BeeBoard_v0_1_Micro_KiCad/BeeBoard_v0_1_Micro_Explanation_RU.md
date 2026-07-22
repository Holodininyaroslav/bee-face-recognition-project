# BeeBoard v0.1 Micro - объяснение проекта

## Главная идея

Эта ревизия сжимает BeeBoard до агрессивного форм-фактора **20 мм x 12 мм**.
Всё, что можно держать внутри кристалла, оставлено внутри FPGA U1:

- AI MIPS Core
- MatrixAccel
- ReLU / AI-модули
- Crypto Communication Module
- Power Control Unit
- Motion Control Unit
- LiFi Controller
- Sensor Interface
- Memory Controller

Снаружи остаётся только то, что физически нельзя заменить логикой FPGA:

- питание и накопление энергии,
- конфигурационная Flash,
- IMU,
- LiFi LED и photodiode,
- низковольтные драйверы приводов,
- краевые pads/flex-подключения к крыльям, пружине, био-входу и сенсорам.

## Размер и назначение

- Плата: **20 мм x 12 мм**.
- Толщина модели: около **0.6 мм**.
- Назначение: максимально компактный прототип архитектуры.
- Это ещё не production Gerber: footprints и часть разводки placeholder, потому что
  точные корпуса приводов, суперконденсатора, LiFi-оптики и био-источника надо
  подтвердить экспериментально.

## Размещение компонентов

| Узел | Что это | Почему снаружи |
| --- | --- | --- |
| U1 | iCE40UP5K / будущий BeeSoC | временный мозг вместо ASIC |
| U2 | SPI Flash | нужна для конфигурации FPGA |
| U3 | BMI270 IMU | физический MEMS-сенсор движения |
| U4 | BQ25570 или LTC3108 option | energy harvesting / supercap management |
| U5 | 1.2 V regulator | низковольтное питание ядра FPGA |
| U6 | 3.3 V regulator | IO, Flash, IMU, LiFi analog |
| U7 | LiFi RX AFE | photodiode требует аналогового front-end |
| U8 | LiFi LED switch | ток microLED нельзя брать напрямую с FPGA |
| D1 | LiFi microLED | оптический передатчик |
| D2 | LiFi photodiode | оптический приёмник |
| U9/U10 | wing drivers | низковольтные силовые выходы |
| U11 | spring release driver | burst/action channel |
| U12 | drill/cutter driver | optional силовой канал |
| J1-J9 | flex / castellated pads | компактная замена JST-разъёмов |

## Слои платы

```text
F.Cu      компоненты, FPGA escape, LiFi, IMU, питание рядом с микросхемами
In1.GND   почти сплошная земля, экран для LiFi RX и FPGA
In2.PWR   острова SUPERCAP_RAW, 1V2_CORE, 3V3_IO
B.Cu      actuator drivers, debug pads, силовые короткие выходы
```

Почему так:

- LiFi photodiode держим коротко и на верхней стороне рядом с D2/U7.
- LED current loop держим отдельно от photodiode input.
- IMU ставится ближе к механическому центру.
- Actuator drivers уводятся на нижнюю сторону, чтобы шум не лез в LiFi/IMU.
- Внутренний GND-слой нужен как экран и стабильная ссылка для FPGA/аналоговых цепей.

## Низковольтная логика

Цель - держать всё в диапазоне сверхнизкого питания:

- FPGA core: около 1.2 V.
- IO/sensors/LiFi analog: около 3.3 V или ниже при подборе конкретных компонентов.
- DRV8838-class drivers: низковольтные H-bridge/actuator outputs.
- Для настоящих piezo-wing приводов потребуется отдельный HV/piezo driver; в этой
  micro-версии он заменён низковольтным placeholder-каналом.

## 3D и экспорт

- `BeeBoard_v0_1_Micro.glb` - KiCad GLB 3D-модель с простыми цветными component boxes.
- `BeeBoard_v0_1_Micro_board_layers.step` - STEP board/copper/layer export без VRML-компонентов.
- `BeeBoard_v0_1_Micro_Layered3D.scad` - отдельная OpenSCAD-модель, где слои платы
  разведены по высоте и видны как стек.
- `BeeBoard_v0_1_Micro_board.svg` - 2D preview верхнего слоя/контуров.

## Текущий статус DRC

KiCad CLI успешно загрузил плату и сделал экспорты. DRC пока сообщает нарушения,
потому что:

- footprints являются placeholder, а не точными заводскими посадочными местами;
- edge pads специально близко к краю как flex/castellated interface;
- схема ещё не синхронизирована с полноценными symbols/footprints;
- финальная разводка будет делаться после фиксации реальных корпусов.

Следующий инженерный шаг: заменить placeholders на реальные footprints и
развести питание/FPGA/IMU/LiFi/драйверы с точными design rules производителя.

