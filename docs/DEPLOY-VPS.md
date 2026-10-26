# Deploy lên VPS iNET (Ubuntu 22.04) + tên miền PA Việt Nam + Cloudflare Free

Làm theo thứ tự. Mỗi bước có phần **Xong khi** để tự kiểm tra trước khi sang bước sau.
Trong tài liệu: `datvanggroup.vn` là tên miền của bạn, `IP_VPS` là địa chỉ IP iNET cấp. Thay bằng giá trị thật.

## Kiến trúc

```
Khách ──HTTPS──► Cloudflare (DNS, CDN, chống DDoS, gói Free)
                     │  chứng chỉ Origin (Full strict)
                     ▼
             VPS iNET · Docker
             ┌──────────────────────────────────────────────┐
             │ caddy :443 ──► web (Next.js :3000) ──► api (:4000) ──► db (PostgreSQL 18)
             └──────────────────────────────────────────────┘
Ảnh/video ──► Cloudflare R2 (media.datvanggroup.vn) — không nằm trên VPS
```

- Chỉ mở cổng 24700 (SSH của iNET), 80, 443. API và DB không ra Internet.
- Trình duyệt gọi API qua chính tên miền website (`/api/v1/...`), nên không cần tên miền `api.` riêng.
- File cấu hình nằm trong `BE-DVG/deploy/`: `compose.prod.yaml`, `Caddyfile`, `env.prod.example`, `backup.sh`.

## Cần chuẩn bị

| Thứ | Ghi chú |
|---|---|
| VPS | Tối thiểu **2 vCPU / 4 GB RAM / 40 GB SSD**. Build website cần khoảng 2–3 GB RAM; bước 5 có tạo swap 4 GB cho chắc. |
| Tài khoản PA Việt Nam | Để đổi nameserver của tên miền. |
| Cloudflare (gói Free là đủ) | DNS, HTTPS, R2. Gói Pro không bắt buộc. |
| GitHub | 2 repo `be-dvg-2026` và `web-dvg-2026`. |
| Gemini API key | Nên bật thanh toán **Tier 1** trước khi mở web cho khách nước ngoài (Free Tier rất dễ hết hạn mức). |
| Gmail App Password | Để gửi email báo khách mới (không bắt buộc ngay). |

---

## Bước 1 — Đẩy code mới nhất lên GitHub (trên máy Mac)

Hiện còn nhiều thay đổi chưa commit ở cả hai repo. Server sẽ lấy code từ GitHub, nên phải đẩy lên trước.

```bash
cd ~/Documents/DVG_WEB/BE-DVG && git add -A && git commit -m "Chuẩn bị deploy" && git push
cd ~/Documents/DVG_WEB/FE-DVG && git add -A && git commit -m "Chuẩn bị deploy" && git push
```

Trước khi `git add -A`, chạy `git status` và kiểm tra **không có** `.env`, `.env.local`, `.local/` trong danh sách. Các file này đã có trong `.gitignore`, nhưng nên tự kiểm lại.

**Xong khi:** trên github.com hai repo có commit mới.

---

## Bước 2 — Chuyển DNS tên miền từ PA Việt Nam sang Cloudflare

1. Cloudflare → **Add a domain** → nhập `datvanggroup.vn` → chọn gói **Free**.
2. Cloudflare quét bản ghi DNS cũ. Xóa các bản ghi `A`/`CNAME` trỏ website cũ, nếu có. Giữ lại bản ghi email (`MX`, `TXT`) nếu đang dùng email theo tên miền.
3. Thêm 2 bản ghi trỏ về VPS, **bật đám mây cam (Proxied)**:

   | Type | Name | Content | Proxy |
   |---|---|---|---|
   | A | `@` | `IP_VPS` | Proxied |
   | A | `www` | `IP_VPS` | Proxied |

4. Cloudflare đưa 2 nameserver (dạng `xxx.ns.cloudflare.com`). Đăng nhập trang quản lý tên miền PA Việt Nam → chọn tên miền → **Quản lý DNS / Đổi Name Server** → thay bằng 2 nameserver của Cloudflare → lưu.
   - Tên miền `.vn` có thể mất vài giờ (tối đa 24–48 giờ) mới cập nhật. Nếu trang PA báo lỗi khi đổi, gọi hỗ trợ PA Việt Nam.

**Xong khi:** Cloudflare gửi email *“datvanggroup.vn is now active”*, hoặc trang Overview hiện **Active**.

---

## Bước 3 — HTTPS trên Cloudflare

1. **SSL/TLS → Overview** → chọn **Full (strict)**.
2. **SSL/TLS → Origin Server → Create Certificate**:
   - Hostnames: `datvanggroup.vn`, `*.datvanggroup.vn`. Thời hạn: 15 năm. Key type: RSA.
   - Cloudflare hiện 2 khối chữ: **Origin Certificate** và **Private Key**. Mở sẵn 2 file text, chép từng khối vào (bước 6 sẽ dán lên VPS). **Private Key chỉ hiện một lần.**
3. **SSL/TLS → Edge Certificates** → bật **Always Use HTTPS**.
4. Gói Free giới hạn mỗi lần tải lên tối đa **100 MB**, nên video tải lên Admin phải **dưới 100 MB**.

---

## Bước 4 — Kho ảnh/video R2 cho production

Các khóa R2 hiện tại đã từng xuất hiện trong ảnh chụp màn hình gửi qua chat, nên **tạo khóa mới cho production**.

1. **R2 → Create bucket**. Có 2 cách:
   - **Dùng lại bucket `dvg-media` đang có:** ảnh đã tải lên giữ nguyên.
   - **Tạo bucket mới `dvg-media-prod`:** phải chép ảnh cũ sang bucket mới.

   Khuyến nghị dùng lại bucket đang có cho đơn giản.
2. Bucket → **Settings → Custom Domains → Connect Domain** → `media.datvanggroup.vn`. Domain đã ở Cloudflare nên bước này tự tạo bản ghi DNS.
   - Link `pub-….r2.dev` chỉ dùng thử và bị giới hạn tốc độ, không dùng cho production.
3. **R2 → Manage API Tokens → Create Account API token**:
   - Quyền **Object Read & Write**, chỉ cho bucket ở mục 1.
   - Lưu lại *Access Key ID*, *Secret Access Key* và *endpoint* `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. Xóa token R2 cũ (token dùng thử) sau khi production chạy ổn.

**Xong khi:** mở `https://media.datvanggroup.vn/<tên-một-file-có-sẵn>` thấy ảnh.

---

## Bước 5 — Cài đặt VPS (SSH vào server)

Từ Mac: `ssh -p 24700 root@IP_VPS`. iNET để SSH ở **cổng 24700**, không phải 22. Mật khẩu root iNET gửi qua email.

```bash
# Cập nhật hệ thống, múi giờ Việt Nam
apt update && apt -y upgrade
timedatectl set-timezone Asia/Ho_Chi_Minh

# Tạo user "deploy" và cho quyền sudo
adduser deploy
usermod -aG sudo deploy

# Tường lửa: chỉ SSH (cổng 24700 của iNET), HTTP, HTTPS
# KHÔNG dùng "ufw allow OpenSSH": lệnh đó chỉ mở cổng 22, sẽ khóa bạn ngoài VPS.
ufw allow 24700/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# Swap 4 GB (tránh hết RAM khi build)
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker (bản chính thức)
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# Thư mục ứng dụng
mkdir -p /opt/dvg && chown deploy:deploy /opt/dvg
```

Nên đăng nhập bằng SSH key thay vì mật khẩu:
1. Trên Mac, chạy `ssh-copy-id -p 24700 deploy@IP_VPS`.
2. Thử `ssh -p 24700 deploy@IP_VPS`. Vào được rồi mới tắt đăng nhập bằng mật khẩu: sửa `/etc/ssh/sshd_config`, đặt `PasswordAuthentication no` và `PermitRootLogin no`, rồi chạy `systemctl restart ssh`.

**Xong khi:** `ssh -p 24700 deploy@IP_VPS` rồi chạy `docker run --rm hello-world` thấy dòng *Hello from Docker!*.

---

## Bước 6 — Lấy code về VPS (đăng nhập user `deploy`)

Hai repo là private, nên mỗi repo cần một **deploy key** (khóa chỉ đọc):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/dvg_be -N "" -C "vps-be"
ssh-keygen -t ed25519 -f ~/.ssh/dvg_fe -N "" -C "vps-fe"
cat >> ~/.ssh/config <<'EOF'
Host github-be
  HostName github.com
  IdentityFile ~/.ssh/dvg_be
Host github-fe
  HostName github.com
  IdentityFile ~/.ssh/dvg_fe
EOF
cat ~/.ssh/dvg_be.pub   # dán vào GitHub: repo be-dvg-2026 › Settings › Deploy keys › Add (không tick Allow write)
cat ~/.ssh/dvg_fe.pub   # dán vào repo web-dvg-2026 tương tự
```

```bash
cd /opt/dvg
git clone git@github-be:tducviet86/be-dvg-2026.git BE-DVG
git clone git@github-fe:tducviet86/web-dvg-2026.git FE-DVG
```

Tên thư mục phải đúng là `BE-DVG` và `FE-DVG`, vì `compose.prod.yaml` tìm website ở `../../FE-DVG`.

---

## Bước 7 — Cấu hình bí mật và chứng chỉ

```bash
cd /opt/dvg/BE-DVG/deploy
cp env.prod.example .env.prod && chmod 600 .env.prod
# Tạo sẵn các chuỗi ngẫu nhiên rồi dán vào .env.prod:
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48)"
echo "REVALIDATE_SECRET=$(openssl rand -hex 24)"
echo "IP_HASH_SALT=$(openssl rand -hex 16)"
nano .env.prod
```

Trong `.env.prod` điền:
- `DOMAIN`: tên miền, không có `https://`.
- 4 chuỗi ngẫu nhiên ở trên.
- `S3_*` và `MEDIA_PUBLIC_BASE_URL=https://media.datvanggroup.vn`, lấy từ bước 4.
- `GEMINI_API_KEY`: nên tạo một key riêng cho production.
- `SMTP_*`: điền nếu muốn nhận email khi có khách mới.

Sau khi DB đã chạy, **không đổi `POSTGRES_PASSWORD`** nữa: DB giữ mật khẩu cũ, API sẽ không kết nối được.

Dán chứng chỉ Origin từ bước 3:

```bash
mkdir -p certs && nano certs/origin.pem   # dán khối Origin Certificate
nano certs/origin.key                      # dán khối Private Key
chmod 600 certs/origin.key
```

---

## Bước 8 — Build và chạy lần đầu

```bash
cd /opt/dvg/BE-DVG/deploy
alias dc='docker compose --env-file .env.prod -f compose.prod.yaml'   # gõ tắt; thêm vào ~/.bashrc để giữ lâu dài

dc build                      # lần đầu mất khoảng 5–15 phút
dc up -d db                   # bật DB trước
```

Tiếp theo chọn **A** hoặc **B**.

### A. Bắt đầu sạch (chưa có dữ liệu)

```bash
dc run --rm migrate                          # tạo bảng (prisma migrate deploy)
dc run --rm migrate npm run db:seed          # vai trò, quyền, danh mục
dc run --rm -e ADMIN_EMAIL=ban@datvanggroup.vn -e ADMIN_NAME="Họ Tên" \
  -e ADMIN_PASSWORD='MatKhau-Manh-2026' migrate npm run admin:create
```

### B. Chuyển toàn bộ dữ liệu đang nhập trên máy dev (dự án, căn hộ, bài viết, bản dịch…)

Trên **Mac**:

```bash
pg_dump --format=custom --no-owner --no-acl \
  "postgresql://dvg:<mật-khẩu-dev>@127.0.0.1:5433/dvg_dev" -f ~/dvg-dev.dump
scp -P 24700 ~/dvg-dev.dump deploy@IP_VPS:/opt/dvg/BE-DVG/deploy/backups/
```

Mật khẩu dev nằm trong `DATABASE_URL` của file `BE-DVG/.env`.

Trên **VPS**: khôi phục vào DB **còn trống**, ngay sau `dc up -d db`. **Không** chạy `dc run --rm migrate` trước bước này, vì bản dump đã có sẵn bảng và lịch sử migration.

```bash
mkdir -p backups
dc exec -T db pg_restore -U dvg -d dvg --no-owner --no-acl /backups/dvg-dev.dump
dc run --rm migrate          # áp các migration mới hơn bản dump (nếu có)

# Ảnh đang dùng link pub-….r2.dev → đổi sang tên miền media
dc exec -T db psql -U dvg -d dvg -c \
  "UPDATE media_assets SET url = replace(url, 'https://pub-a7d6f6e051d841df977b52cc9dd525da.r2.dev', 'https://media.datvanggroup.vn');"

# Tài khoản dev KHÔNG được dùng trên production: tạo admin thật rồi khóa tài khoản dev
dc run --rm -e ADMIN_EMAIL=ban@datvanggroup.vn -e ADMIN_NAME="Họ Tên" \
  -e ADMIN_PASSWORD='MatKhau-Manh-2026' migrate npm run admin:create
dc exec -T db psql -U dvg -d dvg -c \
  "UPDATE users SET status='DISABLED' WHERE email IN ('admin@dvg.test','admin1@gmail.com');"
```

Ghi chú cho cách B:
- Dữ liệu dev có **căn mẫu** (demo). Website ghi rõ "Căn mẫu" và ẩn chúng khỏi Google, nhưng trước khi mở cho khách nên **xóa** hoặc **gỡ xuất bản** các căn mẫu không cần.
- Nếu tạo bucket mới ở bước 4 thì phải chép ảnh sang bucket mới trước khi đổi link.
- Cũng có thể khóa tài khoản dev trong **Admin › Người dùng** thay vì chạy lệnh SQL.

### Bật toàn bộ

```bash
dc up -d
dc ps                          # db, api, web, caddy đều "running"/"healthy"
dc exec caddy caddy validate --config /etc/caddy/Caddyfile
dc logs -f api                 # Ctrl+C để thoát; API báo rõ nếu thiếu/sai biến môi trường
```

**Xong khi:**
- `https://datvanggroup.vn` mở được, có ổ khóa HTTPS.
- `https://datvanggroup.vn/api/v1/health/ready` trả `{"status":"ok"…}`.
- Đăng nhập `https://datvanggroup.vn/admin` bằng tài khoản vừa tạo được.

---

## Bước 9 — Kiểm tra sau khi lên

1. **Admin:**
   - Tạo hoặc sửa một căn, tải 1 ảnh và 1 video nhỏ, lưu lại. Ra trang căn xem ảnh/video hiện đúng.
   - Bấm **Tạo gợi ý** SEO thử một lần.
2. **Khách:** gửi thử form tư vấn. Khách mới phải hiện trong **Admin › Khách hàng**, và email báo về nếu đã cấu hình SMTP.
3. **Ngôn ngữ:** chuyển sang EN/KO/ZH. Chạy từ Mac để dịch trước toàn bộ trang (cần Gemini Tier 1):
   ```bash
   cd ~/Documents/DVG_WEB/FE-DVG
   SITE_URL=https://datvanggroup.vn REVALIDATE_SECRET=<giống .env.prod> npm run i18n:warm
   ```
4. **Admin › Cài đặt:** điền địa chỉ văn phòng, giờ làm việc (vd `T2–T7 8:00–18:00`), email và email nhận yêu cầu.
5. **Google:**
   - Vào Search Console, thêm `datvanggroup.vn`. Xác minh bằng bản ghi TXT trên Cloudflare.
   - Gửi sitemap `https://datvanggroup.vn/sitemap.xml`.
   - Kiểm tra trang chủ, 1 dự án và 1 căn bằng [Rich Results Test](https://search.google.com/test/rich-results).
6. **IP khách:** gửi 1 form thử, rồi chạy `dc logs api | grep -i "x-forwarded-for" | tail -3`. IP đầu tiên phải là IP thật của bạn, không phải `172.x.x.x`. Nếu sai, đổi `TRUST_PROXY` trong `compose.prod.yaml` (thử `1` hoặc `3`) rồi chạy `dc up -d api`.

---

## Bước 10 — Sao lưu tự động

```bash
crontab -e
# thêm dòng:
30 2 * * * /opt/dvg/BE-DVG/deploy/backup.sh >> /home/deploy/dvg-backup.log 2>&1
```

- Script chạy mỗi đêm 2:30, giữ bản sao lưu 14 ngày trong `deploy/backups/`.
- Bản sao lưu nằm cùng VPS. Mỗi tuần nên tải 1 bản về máy hoặc lên R2: `scp -P 24700 deploy@IP_VPS:/opt/dvg/BE-DVG/deploy/backups/dvg-*.dump ~/Backups/`.
- Ảnh/video đã nằm trên R2. Nên bật thêm sao lưu ảnh chụp VPS định kỳ (snapshot) ở trang iNET nếu gói có hỗ trợ.

Khôi phục, chỉ làm khi thật cần và vào DB trống:

```bash
dc stop api web
dc exec -T db psql -U dvg -d postgres -c "DROP DATABASE dvg;" -c "CREATE DATABASE dvg OWNER dvg;"
dc exec -T db pg_restore -U dvg -d dvg --no-owner /backups/dvg-YYYY-MM-DD-HHMM.dump
dc up -d
```

---

## Cập nhật phiên bản mới (mỗi lần sửa code)

```bash
# Trên Mac: commit + push cả hai repo (bước 1)
# Trên VPS:
cd /opt/dvg/BE-DVG && git pull
cd /opt/dvg/FE-DVG && git pull
cd /opt/dvg/BE-DVG/deploy
./backup.sh                    # sao lưu trước khi đổi cấu trúc DB
dc build
dc run --rm migrate            # áp migration mới (an toàn nếu không có)
dc up -d                       # thay container mới, vài giây gián đoạn
docker image prune -f          # dọn image cũ
```

Quay lại bản trước: `git checkout <commit-cũ>` ở repo bị lỗi, rồi chạy lại `dc build && dc up -d`.

## Tăng tốc qua Cloudflare (Cache Rules, làm một lần)

Gói Free đưa khách Việt Nam qua máy chủ Cloudflare ở Singapore, Hồng Kông, có khi cả châu Âu. Mỗi file phải đi vòng như vậy về VPS thì chậm. Hai thiết lập dưới đây giữ sẵn file và ảnh ở Cloudflare, khách không phải đợi VPS nữa. Cả hai đều miễn phí.

**1. Smart Tiered Cache:** Cloudflare › chọn `datvanggroup.vn` › **Caching › Tiered Cache** › bật **Smart Tiered Caching Topology**.

**2. Cache Rule:** **Caching › Cache Rules › Create rule**

- Rule name: `DVG static & images`
- **If incoming requests match… › Custom filter expression** › bấm **Edit expression**, dán:

  ```
  starts_with(http.request.uri.path, "/_next/static/") or starts_with(http.request.uri.path, "/_next/image") or starts_with(http.request.uri.path, "/images/")
  ```

- **Cache eligibility:** chọn **Eligible for cache**.
- **Edge TTL:** **Use cache-control header if present, use default Cloudflare caching behavior if not**.
- **Browser TTL:** **Respect origin TTL**.
- Bấm **Deploy**.

Không thêm `/`, trang HTML hay `/api` vào rule này: trang phải luôn lấy dữ liệu mới, còn API có đăng nhập.

Kiểm tra sau khi deploy (chạy 2 lần, lần 2 phải thấy `cf-cache-status: HIT`):

```bash
curl -sI "https://datvanggroup.vn/_next/image?url=%2Fimages%2Fprojects%2Fcapital.jpg&w=1920&q=70" | grep -i cf-cache-status
```

Nếu sửa ảnh trong `public/images` mà giữ nguyên tên file, vào **Caching › Configuration › Purge Cache › Custom Purge** và dán đường dẫn ảnh đó. Ảnh tải lên từ Admin (R2) có tên mới mỗi lần nên không cần làm việc này.

## Lệnh hay dùng

| Việc | Lệnh |
|---|---|
| Xem trạng thái | `dc ps` |
| Xem log | `dc logs -f --tail=200 api` (hoặc `web`, `caddy`) |
| Khởi động lại | `dc restart api web` |
| Dung lượng đĩa | `df -h` và `docker system df` |
| Vào DB | `dc exec db psql -U dvg -d dvg` |

## Kiểm tra bảo mật trước khi công bố

- [ ] Không còn tài khoản `admin@dvg.test` / `admin1@gmail.com` hoạt động trên production.
- [ ] Token R2 cũ (từng xuất hiện trong ảnh chụp) đã xóa, production dùng token mới chỉ có quyền trên một bucket.
- [ ] `.env.prod` có quyền `600` và không nằm trong Git.
- [ ] SSH chỉ đăng nhập bằng key, đã tắt đăng nhập root.
- [ ] Cloudflare: SSL **Full (strict)**, **Always Use HTTPS** bật.
- [ ] (Nên làm) chỉ cho Cloudflare vào cổng 80/443, để không ai vào thẳng IP VPS:
  - Lấy dải IP tại https://www.cloudflare.com/ips/.
  - Với mỗi dải, chạy `ufw allow from <dải> to any port 443 proto tcp`, rồi `ufw delete allow 443/tcp`. Làm tương tự với cổng 80.
- [ ] Gemini key production có đặt hạn mức chi tiêu.
- [ ] Cron sao lưu đã chạy ít nhất một lần (`ls deploy/backups`).
