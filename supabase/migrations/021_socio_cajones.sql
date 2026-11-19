-- Socio (Mike) también administra cajones: apartados a externos.
drop policy if exists socio_all on parking_loans;
create policy socio_all on parking_loans for all to authenticated using (my_role() = 'socio') with check (my_role() = 'socio');
select 'ok';
