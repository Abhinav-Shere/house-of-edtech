-- ============================================================================
-- Optional Postgres Row Level Security (defense-in-depth)
-- ============================================================================
-- The application already enforces tenant isolation via strict ORM scoping
-- (every query is filtered through the collaborators table). RLS adds a second
-- wall at the database layer so that even a compromised app connection cannot
-- read or write rows outside the current user's documents.
--
-- HOW TO USE
--   1. Connect to your database AFTER running `prisma db push` / migrations.
--   2. Run this file:  psql "$DATABASE_URL" -f prisma/rls.sql
--   3. Have your app set the current user per request/transaction:
--          SET app.current_user_id = '<the authenticated user id>';
--      (You can do this in a Prisma middleware via $executeRaw on a
--       per-request transaction. See README "Row Level Security".)
--
-- NOTE: Prisma migrations connect as the table owner, which bypasses RLS by
--       default. Create a dedicated, non-owner role for the runtime app
--       connection so policies are actually enforced at runtime.
-- ============================================================================

ALTER TABLE documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_states  ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborators    ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions         ENABLE ROW LEVEL SECURITY;

-- Helper: current user id pulled from a session GUC.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$ LANGUAGE sql STABLE;

-- A user can see a document only if they are a collaborator on it.
CREATE POLICY documents_member_access ON documents
  USING (
    EXISTS (
      SELECT 1 FROM collaborators c
      WHERE c."documentId" = documents.id
        AND c."userId" = app_current_user_id()
    )
  );

CREATE POLICY document_states_member_access ON document_states
  USING (
    EXISTS (
      SELECT 1 FROM collaborators c
      WHERE c."documentId" = document_states."documentId"
        AND c."userId" = app_current_user_id()
    )
  );

CREATE POLICY versions_member_access ON versions
  USING (
    EXISTS (
      SELECT 1 FROM collaborators c
      WHERE c."documentId" = versions."documentId"
        AND c."userId" = app_current_user_id()
    )
  );

-- A user can see collaborator rows for documents they belong to.
CREATE POLICY collaborators_member_access ON collaborators
  USING (
    EXISTS (
      SELECT 1 FROM collaborators self
      WHERE self."documentId" = collaborators."documentId"
        AND self."userId" = app_current_user_id()
    )
  );
