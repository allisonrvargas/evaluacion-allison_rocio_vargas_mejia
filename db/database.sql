-- =============================================================
-- API de Postulaciones - Esquema de base de datos
-- Requiere MySQL 8.0.16+ (CHECK constraints aplicadas)
-- =============================================================

SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
-- Misma referencia horaria que usa la API (pool con time_zone = '+00:00')
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS applications_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE applications_db;

-- Orden inverso a las dependencias para poder re-ejecutar el script
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS vacancies;
DROP TABLE IF EXISTS candidates;

-- -------------------------------------------------------------
-- Candidatos
-- -------------------------------------------------------------
CREATE TABLE candidates (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name              VARCHAR(150)  NOT NULL,
  email             VARCHAR(255)  NOT NULL,
  years_experience  INT           NOT NULL DEFAULT 0,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_candidates PRIMARY KEY (id),
  CONSTRAINT uq_candidates_email UNIQUE (email),
  CONSTRAINT chk_candidates_years_experience CHECK (years_experience >= 0),
  CONSTRAINT chk_candidates_name_not_blank CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE = InnoDB;

-- -------------------------------------------------------------
-- Vacantes
-- -------------------------------------------------------------
CREATE TABLE vacancies (
  id                    INT UNSIGNED           NOT NULL AUTO_INCREMENT,
  title                 VARCHAR(150)           NOT NULL,
  min_years_experience  INT                    NOT NULL DEFAULT 0,
  status                ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at            DATETIME               NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_vacancies PRIMARY KEY (id),
  CONSTRAINT chk_vacancies_min_years CHECK (min_years_experience >= 0),
  CONSTRAINT chk_vacancies_title_not_blank CHECK (CHAR_LENGTH(TRIM(title)) > 0)
) ENGINE = InnoDB;

-- -------------------------------------------------------------
-- Postulaciones
-- -------------------------------------------------------------
CREATE TABLE applications (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  candidate_id       INT UNSIGNED NOT NULL,
  vacancy_id         INT UNSIGNED NOT NULL,
  cover_letter       TEXT         NULL,
  source             ENUM('REFERRAL', 'INTERNAL', 'JOB_BOARD', 'OTHER')  NOT NULL,
  score              INT          NOT NULL DEFAULT 0,
  priority           ENUM('LOW', 'MEDIUM', 'HIGH', 'TOP')               NOT NULL,
  status             ENUM('RECEIVED', 'IN_REVIEW', 'REJECTED', 'HIRED') NOT NULL DEFAULT 'RECEIVED',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Sin ON UPDATE: solo debe cambiar cuando cambia el estado (lo gestiona el service)
  status_updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_applications PRIMARY KEY (id),
  CONSTRAINT fk_applications_candidate
    FOREIGN KEY (candidate_id) REFERENCES candidates (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_applications_vacancy
    FOREIGN KEY (vacancy_id) REFERENCES vacancies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_applications_score CHECK (score >= 0),
  CONSTRAINT chk_applications_status_dates CHECK (status_updated_at >= created_at)
) ENGINE = InnoDB;

-- Filtrar por estado en toda la base (p. ej. "todas las IN_REVIEW")
CREATE INDEX idx_applications_status
  ON applications (status);

-- Listado por vacante, opcionalmente filtrado por estado y ordenado por puntaje.
-- Tambien sirve como indice de la FK vacancy_id (prefijo izquierdo).
CREATE INDEX idx_applications_vacancy_status_score
  ON applications (vacancy_id, status, score);

-- Busqueda de postulaciones previas de un candidato a una vacante.
-- Indice NORMAL, no UNIQUE: un candidato REJECTED puede volver a postular
-- a la misma vacante pasados 30 dias (regla aplicada en el service).
-- Tambien sirve como indice de la FK candidate_id (prefijo izquierdo).
CREATE INDEX idx_applications_candidate_vacancy
  ON applications (candidate_id, vacancy_id);

-- -------------------------------------------------------------
-- Datos semilla
-- IDs explicitos para que los tests puedan referenciarlos de forma estable.
-- -------------------------------------------------------------
INSERT INTO candidates (id, name, email, years_experience) VALUES
  (1, 'Ana Lopez',      'ana.lopez@example.com',      5),  -- Cumple Backend (min. 3): caso "experiencia suficiente"
  (2, 'Carlos Mendez',  'carlos.mendez@example.com',  2),  -- No cumple Backend (min. 3): caso "experiencia insuficiente"
  (3, 'Lucia Herrera',  'lucia.herrera@example.com',  8),  -- 3 postulaciones activas: caso penalizacion -2
  (4, 'Diego Ramirez',  'diego.ramirez@example.com',  0);  -- Sin experiencia; rechazado hace 10 dias

INSERT INTO vacancies (id, title, min_years_experience, status) VALUES
  (1, 'Backend Developer Node.js', 3, 'OPEN'),
  (2, 'Frontend Developer React',  2, 'OPEN'),
  (3, 'Tech Lead',                 7, 'CLOSED'),
  (4, 'QA Engineer',               1, 'OPEN'),
  (5, 'DevOps Engineer',           3, 'OPEN'),
  (6, 'Data Analyst',              2, 'OPEN');

-- Score y priority son los que calcularia scoring.service en el momento de
-- crear cada postulacion. Reglas: +4 experiencia, +3 REFERRAL, +2 INTERNAL,
-- +2 palabra clave (node/sql/api), +1 carta > 500 caracteres, -2 si tenia
-- >= 3 activas en otras vacantes; minimo 0.
-- Prioridad: 0-2 LOW, 3-4 MEDIUM, 5-6 HIGH, 7+ TOP.
--
-- "Activas en otras vacantes" se cuenta AL CREAR cada postulacion (como hace
-- la API), por eso ninguna de Lucia tiene penalizacion: al crearlas tenia
-- 0, 1 y 2 activas. La penalizacion la recibe su CUARTA postulacion.
--
-- Fechas relativas a NOW(): re-ejecutar el script antes de correr los tests.
INSERT INTO applications
  (id, candidate_id, vacancy_id, cover_letter, source, score, priority, status, created_at, status_updated_at)
VALUES
  -- Caso: REJECTED hace MAS de 30 dias => Carlos SI puede volver a postular a Backend.
  -- Carlos (2 anios) -> Backend (min. 3), JOB_BOARD, carta de 46 caracteres sin palabra clave.
  --   experiencia 2 >= 3: no  =>  0
  --   fuente JOB_BOARD         =>  0
  --   palabra clave: no        =>  0
  --   carta > 500: no          =>  0
  --   activas en otras: 0      =>  0
  --   total 0 => LOW
  (1, 2, 1, 'Me interesa crecer como desarrollador backend.', 'JOB_BOARD', 0, 'LOW', 'REJECTED',
      NOW() - INTERVAL 45 DAY, NOW() - INTERVAL 40 DAY),

  -- Caso: REJECTED hace MENOS de 30 dias => Diego NO puede volver a postular a QA todavia.
  -- Diego (0 anios) -> QA (min. 1), OTHER, carta de 35 caracteres sin palabra clave.
  --   experiencia 0 >= 1: no  =>  0
  --   fuente OTHER             =>  0
  --   palabra clave: no        =>  0
  --   carta > 500: no          =>  0
  --   activas en otras: 0      =>  0
  --   total 0 => LOW
  (2, 4, 4, 'Busco mi primera oportunidad en QA.', 'OTHER', 0, 'LOW', 'REJECTED',
      NOW() - INTERVAL 14 DAY, NOW() - INTERVAL 10 DAY),

  -- Caso: 3 postulaciones activas de Lucia => su proxima postulacion
  -- (p. ej. a Frontend o QA) recibe -2.

  -- Lucia (8 anios) -> Backend (min. 3), REFERRAL, carta con "API" y "Node".
  --   experiencia 8 >= 3: si  => +4
  --   fuente REFERRAL          => +3
  --   palabra clave: si        => +2
  --   carta > 500: no          =>  0
  --   activas en otras: 0      =>  0
  --   total 9 => TOP
  (3, 3, 1, 'Construyo APIs REST con Node.js desde hace ocho temporadas.', 'REFERRAL', 9, 'TOP', 'RECEIVED',
      NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY),

  -- Lucia (8 anios) -> DevOps (min. 3), INTERNAL, carta sin palabra clave.
  --   experiencia 8 >= 3: si  => +4
  --   fuente INTERNAL          => +2
  --   palabra clave: no        =>  0
  --   carta > 500: no          =>  0
  --   activas en otras: 1      =>  0  (Backend)
  --   total 6 => HIGH
  (4, 3, 5, 'Experiencia con CI/CD y contenedores.', 'INTERNAL', 6, 'HIGH', 'IN_REVIEW',
      NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 2 DAY),

  -- Lucia (8 anios) -> Data Analyst (min. 2), JOB_BOARD, sin carta.
  --   experiencia 8 >= 2: si  => +4
  --   fuente JOB_BOARD         =>  0
  --   palabra clave: no        =>  0
  --   carta > 500: no          =>  0
  --   activas en otras: 2      =>  0  (Backend, DevOps; la penalizacion es con >= 3)
  --   total 4 => MEDIUM
  (5, 3, 6, NULL, 'JOB_BOARD', 4, 'MEDIUM', 'RECEIVED',
      NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 1 DAY);