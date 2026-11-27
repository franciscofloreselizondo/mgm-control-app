-- 041 · Cotizaciones: PDF guardado · Frankie de cara a María
-- (aplicado en producción el 26 nov 2026 como cotizaciones_pdf_guardado y asistente_frankie_de_cara_a_maria)

-- 1) Cotizaciones: el último PDF armado queda guardado para descargarlo o compartirlo sin volver a armarlo.
--    quotes.pdf = { path, name, at, por, sello }; el archivo vive en el bucket 'comprobantes', carpeta cotizaciones/.
alter table public.quotes add column if not exists pdf jsonb;

--    La carpeta cotizaciones/ solo la leen y escriben los superadmin (María y Paco), igual que la tabla quotes.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cotizaciones_solo_super') then
    create policy cotizaciones_solo_super on storage.objects as restrictive for all to authenticated
      using (bucket_id <> 'comprobantes' or name not like 'cotizaciones/%' or public.my_role() = 'superadmin')
      with check (bucket_id <> 'comprobantes' or name not like 'cotizaciones/%' or public.my_role() = 'superadmin');
  end if;
end $$;

-- 2) De cara a María el asistente de WhatsApp se llama Frankie (no Claudio). Los nombres internos no cambian
--    (via = 'claudio', funciones claudio_*): solo el texto visible en la app, «vía Frankie (…)».
do $$ declare r record; d text; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('claudio_editar','claudio_pagar_servicio','claudio_pendiente','claudio_registrar') loop
    d := pg_get_functiondef(r.oid);
    d := replace(replace(d, 'vía Claudio (', 'vía Frankie ('), 'no lo registró Claudio;', 'no lo registró Frankie;');
    execute d;
  end loop;
end $$;
update transactions set description = replace(description, 'vía Claudio (', 'vía Frankie (') where description like '%vía Claudio (%';
update tasks set progress = replace(progress, 'vía Claudio (', 'vía Frankie (') where progress like '%vía Claudio (%';
