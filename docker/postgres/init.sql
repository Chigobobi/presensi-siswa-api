-- Set timezone default ke Asia/Jakarta
ALTER DATABASE presensi_dev SET timezone TO 'Asia/Jakarta';

-- Extension untuk UUID (kalau perlu)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";