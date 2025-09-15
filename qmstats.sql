CREATE DATABASE `qmstats`;
SHOW DATABASES LIKE 'qmstats';
USE qmstats;

-- Users table (example):
CREATE TABLE IF NOT EXISTS users (
  id       INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email    VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

-- 1) Create the core stats table
CREATE TABLE IF NOT EXISTS stats (
  id         BIGINT UNSIGNED PRIMARY KEY,    
  user_id    INT            NOT NULL,
  date       DATE           NOT NULL,
  start_time TIME           NOT NULL,
  end_time   TIME           NOT NULL,
  created_at TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stats_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 2) Prevent exact duplicates per user/date/timeslot
ALTER TABLE stats
  ADD CONSTRAINT uq_user_date_times
    UNIQUE (user_id, date, start_time, end_time);



-- 1a) Create a new mail_openings table, one-to-one with stats.id
CREATE TABLE IF NOT EXISTS mail_openings (
  stat_id               BIGINT UNSIGNED    PRIMARY KEY,
  total_envelopes       INT     NOT NULL,
  file_creation         INT     NOT NULL,
  urgent_file_creation  INT     NOT NULL,
  attachment            INT     NOT NULL,
  urgent_attachment     INT     NOT NULL,
  rejects               INT     NOT NULL,
  wrong_mail            INT     NOT NULL,
  withdraw_letter       INT     NOT NULL,
  CONSTRAINT fk_mail_stat
    FOREIGN KEY (stat_id)
    REFERENCES stats(id)
    ON DELETE CASCADE
);

-- 1b) (Optional) If you’d rather store as JSON in stats.mail_opening,
-- you can skip this table and just ALTER stats to add a JSON column:
--   ALTER TABLE stats ADD COLUMN mail_opening JSON NOT NULL DEFAULT ('{}');

ALTER TABLE mail_openings
  ADD COLUMN user_id    INT            NULL AFTER stat_id,
  ADD COLUMN first_name VARCHAR(255)   NULL AFTER user_id,
  ADD COLUMN surname    VARCHAR(255)   NULL AFTER first_name;

UPDATE mail_openings AS mo
JOIN stats           AS s  ON s.id = mo.stat_id
JOIN users           AS u  ON u.id = s.user_id
SET
  mo.user_id    = s.user_id,
  mo.first_name = u.first_name,
  mo.surname    = u.surname;

ALTER TABLE mail_openings
  MODIFY user_id    INT          NOT NULL,
  MODIFY first_name VARCHAR(255) NOT NULL,
  MODIFY surname    VARCHAR(255) NOT NULL,
  ADD CONSTRAINT fk_mail_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS file_creations (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stat_id             BIGINT UNSIGNED    NOT NULL,
  user_id             INT                NOT NULL,
  first_name          VARCHAR(255)       NOT NULL,
  surname             VARCHAR(255)       NOT NULL,
  category            ENUM('individual','family') NOT NULL,
  urgency             ENUM('regular','urgent')     NOT NULL,
  group_index         INT                DEFAULT NULL,
  row_index           INT                NOT NULL,
  value               INT                NOT NULL,
  natp                BOOLEAN            NOT NULL DEFAULT FALSE,
  rtd                 BOOLEAN            NOT NULL DEFAULT FALSE,
  coi                 BOOLEAN            NOT NULL DEFAULT FALSE,
  none                BOOLEAN            NOT NULL DEFAULT FALSE,
  FOREIGN KEY (stat_id) REFERENCES stats(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)   ON DELETE CASCADE
);

-- attachments
CREATE TABLE IF NOT EXISTS attachments (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stat_id      BIGINT UNSIGNED NOT NULL,
  user_id      INT NOT NULL,
  first_name   VARCHAR(255) NOT NULL,
  surname      VARCHAR(255) NOT NULL,
  category     ENUM('attachment')             NOT NULL,
  urgency      ENUM('regular','urgent')       NOT NULL,
  row_index    INT NOT NULL,
  value        INT NOT NULL,
  natp         BOOLEAN NOT NULL DEFAULT FALSE,
  rtd          BOOLEAN NOT NULL DEFAULT FALSE,
  coi          BOOLEAN NOT NULL DEFAULT FALSE,
  none         BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (stat_id) REFERENCES stats(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Rejects (renamed count → value)
CREATE TABLE IF NOT EXISTS rejects (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stat_id       BIGINT UNSIGNED               NOT NULL,
  user_id       INT                           NOT NULL,
  first_name    VARCHAR(255)                  NOT NULL,
  surname       VARCHAR(255)                  NOT NULL,
  row_index     INT                            NOT NULL,
  value         INT                            NOT NULL,
  natp          BOOLEAN                        NOT NULL DEFAULT FALSE,
  rtd           BOOLEAN                        NOT NULL DEFAULT FALSE,
  coi           BOOLEAN                        NOT NULL DEFAULT FALSE,
  none          BOOLEAN                        NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_rej_stat FOREIGN KEY (stat_id) REFERENCES stats(id) ON DELETE CASCADE,
  CONSTRAINT fk_rej_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Reject reasons
CREATE TABLE IF NOT EXISTS reject_reasons (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reject_id     BIGINT UNSIGNED               NOT NULL,
  reason        VARCHAR(1024)                 NOT NULL,
  CONSTRAINT fk_rr_reject FOREIGN KEY (reject_id) REFERENCES rejects(id) ON DELETE CASCADE
);


SELECT * FROM users;
SELECT * FROM stats;
SELECT * FROM mail_openings;
SELECT * FROM qmstats.stats;
select * from file_creations;
select * from attachments;
select * from rejects;
select * from reject_reasons;


DESCRIBE stats;
describe users;
describe mail_openings;
describe file_creations;




