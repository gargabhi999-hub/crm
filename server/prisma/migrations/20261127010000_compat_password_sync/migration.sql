-- Keep legacy "password" column synchronized alongside "password_hash" so
-- un-deployed production instances continue working seamlessly until updated.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password" TEXT;

UPDATE "users"
SET "password" = "password_hash"
WHERE "password" IS NULL AND "password_hash" IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_users_password_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."password_hash" IS NULL AND NEW."password" IS NOT NULL THEN
      NEW."password_hash" := NEW."password";
    ELSIF NEW."password" IS NULL AND NEW."password_hash" IS NOT NULL THEN
      NEW."password" := NEW."password_hash";
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW."password_hash" IS DISTINCT FROM OLD."password_hash" AND NEW."password_hash" IS NOT NULL THEN
      NEW."password" := NEW."password_hash";
    ELSIF NEW."password" IS DISTINCT FROM OLD."password" AND NEW."password" IS NOT NULL THEN
      NEW."password_hash" := NEW."password";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_users_password_columns ON "users";
CREATE TRIGGER trg_sync_users_password_columns
BEFORE INSERT OR UPDATE ON "users"
FOR EACH ROW
EXECUTE FUNCTION sync_users_password_columns();
