BEGIN;
-- 1) 回填历史房源的 tenant_id（按 agent 名称匹配）
UPDATE lib_properties p SET tenant_id = a.id
FROM lib_agents a
WHERE p.tenant_id IS NULL AND lower(p.agent) = lower(a.name);

-- 2) 不完整房源移出池/公开（无区域或无价格）
UPDATE lib_properties
SET visibility = 'private'
WHERE visibility IN ('pool','public')
  AND (area_code IS NULL OR (COALESCE(asking_price,0) = 0 AND COALESCE(rent_price,0) = 0));

-- 3) 加上租户外键，删账号时房源保留但 tenant_id 置空
ALTER TABLE lib_properties DROP CONSTRAINT IF EXISTS lib_properties_tenant_id_fkey;
ALTER TABLE lib_properties ADD CONSTRAINT lib_properties_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES lib_agents(id) ON DELETE SET NULL;
COMMIT;
