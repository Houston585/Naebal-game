# Как выложить игру в сеть и обновлять её

Игра — один Node.js-сервер без базы данных и внешних зависимостей. Партии лежат JSON-файлами в папке `DATA_DIR`. Хостингу нужно три вещи:

1. Node.js 20+ (или Docker — в проекте есть `Dockerfile`).
2. **Постоянный диск** для `DATA_DIR`, иначе партии пропадут при перезапуске.
3. Долгие соединения (SSE): сервер держит открытое соединение с каждым игроком.

Проверка, что сервер жив: `GET /api/health`.

## Вариант А. Railway — проще всего, без своего сервера

1. Заведите аккаунт на GitHub и создайте **приватный** репозиторий, загрузите туда папку проекта (через GitHub Desktop или сайт — «Add file → Upload files»).
2. Зайдите на railway.com → New Project → Deploy from GitHub repo → выберите репозиторий. Railway сам найдёт `Dockerfile`.
3. В настройках сервиса: **Volumes → Add Volume**, путь монтирования `/data`.
4. **Settings → Networking → Generate Domain** — получите адрес вида `labean-production.up.railway.app`.
5. Откройте адрес, создайте комнату и отправьте друзьям код или ссылку.

Стоимость — несколько долларов в месяц (есть пробный кредит). Похоже работают Fly.io (`fly launch`, затем `fly volumes create data` и mount `/data`) и Render (платный тариф с Disk; на бесплатном диск не сохраняется).

## Вариант Б. Свой VPS (Timeweb Cloud, Selectel, Beget, Hetzner и т.п.)

Подходит, если нужен сервер в России или полный контроль. Самый маленький тариф (1 vCPU, 1 ГБ) хватит с запасом.

```bash
# на сервере с Ubuntu
sudo apt update && sudo apt install -y docker.io git
git clone <адрес вашего репозитория> labean && cd labean
sudo docker build -t labean .
sudo docker run -d --name labean --restart unless-stopped -p 80:8080 -v labean-data:/data labean
```

Игра откроется по IP сервера. Для домена и HTTPS поставьте перед игрой Caddy — он сам получит сертификат:

```bash
sudo apt install -y caddy
echo 'labean.ваш-домен.ru { reverse_proxy 127.0.0.1:8080 }' | sudo tee /etc/caddy/Caddyfile
sudo docker rm -f labean && sudo docker run -d --name labean --restart unless-stopped -p 127.0.0.1:8080:8080 -v labean-data:/data labean
sudo systemctl reload caddy
```

## Вариант В. Быстро сыграть с друзьями со своего компьютера

1. Установите Node.js 20+, распакуйте архив, в папке выполните `npm start`.
2. Откройте наружу временный адрес, например `npx localtunnel --port 8080` или Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:8080`).
3. Отправьте друзьям полученную ссылку. Работает, пока включён ваш компьютер.

## Обновления

**Как выкатывать.** Меняете код → отправляете в GitHub (`git push`) → Railway пересобирает и перезапускает сам за 1–2 минуты. На VPS:

```bash
cd labean && git pull && sudo docker build -t labean . && sudo docker rm -f labean && sudo docker run -d --name labean --restart unless-stopped -p 127.0.0.1:8080:8080 -v labean-data:/data labean
```

**Что происходит с идущими партиями.** Сохранения переживают перезапуск: после обновления игроки просто обновляют страницу. Но если меняется формат партии (география карты, состав юнитов), старые партии продолжать опасно — для этого есть `MAP_VERSION` в `shared/engine/game.js`. Увеличьте его — и сервер перестанет поднимать старые партии. Лучше выкатывать такие обновления, когда никто не играет.

**После правок кода** пересоберите `play.html` (версию, которая открывается двойным щелчком): `npm run build`.

**Перед каждым обновлением** запускайте `npm test`: тесты проверяют правила, скрытую информацию и сохранение.

**Где что менять без программирования логики:**

| Что | Файл |
|---|---|
| числа правил, таймеры, очки, тайники | `shared/config/rules.js` |
| юниты и их сила | `shared/config/units.js` |
| тексты и параметры карт | `shared/config/cards.js` |
| картинки карточек | `client/assets/cards/<код>.jpg` |
| карта и соседства | `shared/config/map.js`, `client/assets/map.png` |

## Оптимизация в перспективе

Сейчас один сервер спокойно держит десятки одновременных партий. Если игра вырастет:

- **Картинки** — перевести карточки и карту в WebP (в 2–3 раза легче) и раздавать через CDN (Cloudflare бесплатно).
- **Хранилище** — заменить JSON-файлы на SQLite или PostgreSQL: меняется только `server/store.js`.
- **Аккаунты и рейтинг** — вход через Telegram или email; сейчас игрок привязан к комнате ссылкой.
- **Мобильная версия** — отдельная раскладка экрана для телефона; движок менять не нужно.
- **Мониторинг** — Railway и VPS-провайдеры показывают логи и нагрузку; ошибки можно отправлять в Sentry.
