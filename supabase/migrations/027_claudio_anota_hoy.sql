-- Lo que Claudio registra por WhatsApp se anota en sync_log (action = 'claudio') para que salga en Hoy
-- con el mismo patrón que los cambios de Airbnb (se queda hasta marcarlo visto).
-- Las herramientas del agente llaman claudio_anota(<función claudio_*>, depa).
create or replace function claudio_anota(p_resultado text, p_depa text default null) returns text language plpgsql set search_path = public as $$
begin
  if p_resultado like 'OK:%' then
    insert into sync_log (property_code, action, detail)
    values (claudio_depa(p_depa), 'claudio', left(trim(regexp_replace(regexp_replace(substr(p_resultado, 5), '\s*\(id [0-9a-f-]{36}\)', ''), '\s+', ' ', 'g')), 300));
  end if;
  return p_resultado;
end $$;
revoke all on function claudio_anota(text, text) from public, anon, authenticated;
