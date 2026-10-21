export const USER_SCHEMA_STATEMENTS = [
  `CREATE OR REPLACE FUNCTION users_roles_are_unique(assigned varchar[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT COALESCE(cardinality(assigned) = (SELECT count(DISTINCT role_name) FROM unnest(assigned) AS role_name), false);
$fn$`,
  `CREATE TABLE IF NOT EXISTS users (
  id varchar(64) PRIMARY KEY,
  email varchar(254) NOT NULL,
  full_name varchar(200) NOT NULL,
  department varchar(100) NOT NULL,
  status varchar(8) NOT NULL,
  roles varchar(20)[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_id_not_blank CHECK (length(btrim(id)) > 0),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_full_name_length CHECK (char_length(full_name) BETWEEN 1 AND 200),
  CONSTRAINT users_department_length CHECK (char_length(department) BETWEEN 1 AND 100),
  CONSTRAINT users_status_allowed CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT users_roles_not_empty CHECK (cardinality(roles) >= 1),
  CONSTRAINT users_roles_allowed CHECK (roles <@ ARRAY['ADMIN', 'USER', 'AUDITOR']::varchar(20)[]),
  CONSTRAINT users_roles_unique CHECK (users_roles_are_unique(roles))
)`,
] as const;
