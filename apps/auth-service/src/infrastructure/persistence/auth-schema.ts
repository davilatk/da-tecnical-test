export const AUTH_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS roles (
  name varchar(20) PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_name_allowed CHECK (name IN ('ADMIN', 'USER', 'AUDITOR'))
)`,
  `CREATE TABLE IF NOT EXISTS auth_credentials (
  id uuid PRIMARY KEY,
  email varchar(254) NOT NULL,
  password_hash varchar(255) NOT NULL,
  roles varchar(20)[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_credentials_email_unique UNIQUE (email),
  CONSTRAINT auth_credentials_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT auth_credentials_roles_not_empty CHECK (cardinality(roles) >= 1),
  CONSTRAINT auth_credentials_roles_allowed CHECK (roles <@ ARRAY['ADMIN', 'USER', 'AUDITOR']::varchar(20)[])
)`,
  `CREATE OR REPLACE FUNCTION auth_credentials_roles_reference_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.roles) AS assigned(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM roles WHERE roles.name = assigned.name
    )
  ) THEN
    RAISE EXCEPTION 'auth credential role does not reference roles.name';
  END IF;
  RETURN NEW;
END;
$fn$`,
  'DROP TRIGGER IF EXISTS auth_credentials_roles_reference ON auth_credentials',
  `CREATE TRIGGER auth_credentials_roles_reference
BEFORE INSERT OR UPDATE ON auth_credentials
FOR EACH ROW
EXECUTE FUNCTION auth_credentials_roles_reference_roles()`,
] as const;
