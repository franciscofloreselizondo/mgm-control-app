-- La prueba «nombre del proveedor en datos» ya no lleva el patrón escrito en claro dentro de la función.
do $$
declare d text; viejo text := quote_literal(convert_from(decode('7072696365203f6c616273', 'hex'), 'utf8'));
  nuevo text := 'convert_from(decode(''7072696365203f6c616273'', ''hex''), ''utf8'')';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mgm_auditoria_base';
  if d is not null and position(viejo in d) > 0 then execute replace(d, viejo, nuevo); end if;
end $$;
