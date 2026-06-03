-- ============================================================
-- REQUIRED: Fix all DB constraints to unblock Pipeline→Lead→Deal flow
-- Run this once in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. leads.stage — add 'pipeline', 'converted', 'proposal_sent'
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE leads ADD CONSTRAINT leads_stage_check
  CHECK (stage IN (
    'pipeline', 'new', 'contacted', 'qualified',
    'proposal', 'proposal_sent', 'converted', 'won', 'lost'
  ) OR stage IS NULL);

-- 2. leads.source — add all current sources including 'google'
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN (
    'website', 'linkedin', 'referral', 'cold_call', 'email_campaign',
    'event', 'partner', 'social_media', 'ads', 'walk_in', 'google', 'other',
    'call', 'email', 'social', 'exhibition'
  ) OR source IS NULL);

-- 3. deals — add missing columns (safe to run even if already exist)
ALTER TABLE deals ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS close_date   DATE;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

-- Backfill company_name from title where still null
UPDATE deals SET company_name = title WHERE (company_name IS NULL OR company_name = '') AND title IS NOT NULL;

-- 4. deals.stage — update constraint to match frontend stages
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN (
    'new', 'contacted', 'meeting_scheduled', 'proposal_sent',
    'negotiation', 'won', 'lost',
    'reverted_to_lead', 'reverted_to_pipeline'
  ));

-- Migrate any records still using old stage values
UPDATE deals SET stage = CASE stage
  WHEN 'prospecting'   THEN 'new'
  WHEN 'qualification' THEN 'contacted'
  WHEN 'proposal'      THEN 'proposal_sent'
  WHEN 'closed_won'    THEN 'won'
  WHEN 'closed_lost'   THEN 'lost'
  ELSE stage
END
WHERE stage NOT IN (
  'new','contacted','meeting_scheduled','proposal_sent',
  'negotiation','won','lost','reverted_to_lead','reverted_to_pipeline'
);

ALTER TABLE deals ALTER COLUMN stage SET DEFAULT 'new';

-- 5. leads — add pipeline-specific columns (safe if already exist)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) DEFAULT 'new_prospect';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacts      JSONB        DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_code     TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_id   UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_locked     BOOLEAN      DEFAULT FALSE;

-- 6. RLS — ensure open policies exist
ALTER TABLE leads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_all"  ON leads;
CREATE POLICY "leads_all"  ON leads  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "deals_all"  ON deals;
CREATE POLICY "deals_all"  ON deals  FOR ALL USING (true) WITH CHECK (true);

-- 7. lead_code trigger (ensures every pipeline record gets a unique code)
CREATE OR REPLACE FUNCTION fn_set_lead_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.lead_code IS NULL OR NEW.lead_code = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(lead_code FROM 6) AS INTEGER)), 0) + 1
    INTO next_num
    FROM leads
    WHERE lead_code ~ '^LEAD-[0-9]+$';
    NEW.lead_code := 'LEAD-' || LPAD(next_num::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_code ON leads;
CREATE TRIGGER trg_lead_code
  BEFORE INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION fn_set_lead_code();
