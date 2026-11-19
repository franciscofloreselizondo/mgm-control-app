-- "N/A" en la asignación de limpieza: salida que no lleva limpieza. Inactiva para que no salga en nómina ni listas.
insert into cleaners (key, name, phone, active) values ('NA', 'N/A', null, false) on conflict (key) do nothing;
select 'ok';
