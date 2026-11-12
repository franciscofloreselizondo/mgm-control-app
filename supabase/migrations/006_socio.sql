-- Rol "socio" (Mike): lee y escribe calendario (reservas, limpiezas extra, bloqueos), pendientes, compras, claves y ligas.
-- No ve nómina, gastos e ingresos, ni usuarios.
alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check check (role in ('superadmin','socio','finanzas'));

do $$
declare t text;
begin
  -- lectura y escritura
  foreach t in array array['reservations','cleanings','blocks','tasks','purchases','access_codes'] loop
    execute format('drop policy if exists socio_all on %I', t);
    execute format('create policy socio_all on %I for all to authenticated using (my_role() = ''socio'') with check (my_role() = ''socio'')', t);
  end loop;
  -- solo lectura (para pintar el calendario)
  foreach t in array array['properties','cleaners','cleaning_rates','days_off','settings'] loop
    execute format('drop policy if exists socio_read on %I', t);
    execute format('create policy socio_read on %I for select to authenticated using (my_role() = ''socio'')', t);
  end loop;
end $$;
-- ligas de Airbnb: el socio puede editar los depas (la liga vive en properties)
drop policy if exists socio_upd on properties;
create policy socio_upd on properties for update to authenticated using (my_role() = 'socio') with check (my_role() = 'socio');
