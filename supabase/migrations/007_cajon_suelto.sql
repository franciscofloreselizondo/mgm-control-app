-- Cajones de estacionamiento que no son depa (p. ej. "Cajón María" en Qalina)
alter table properties add column if not exists kind text default 'depa';
insert into properties(code, building, sort, has_parking, lends_parking, active, kind)
values ('Cajón María', 'Qalina', 999, true, true, true, 'cajon')
on conflict (code) do update set kind = 'cajon', building = 'Qalina', has_parking = true, lends_parking = true, active = true;
select code, building, has_parking, lends_parking, kind from properties where kind = 'cajon';
