-- Auditoría de control · MGM Control App. La batería completa vive en la función mgm_auditoria()
-- (supabase/migrations/032_auditoria.sql). Es de solo lectura y devuelve un JSON.
select mgm_auditoria();
