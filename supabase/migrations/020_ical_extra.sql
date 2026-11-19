-- Calendario de un anuncio que ocupa varios depas (LH 2005 completo → LHA y LHB, lock-off).
alter table properties add column if not exists ical_extra text;
select 'ok';
