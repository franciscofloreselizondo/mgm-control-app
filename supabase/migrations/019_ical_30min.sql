select cron.alter_job((select jobid from cron.job where jobname = 'mgm-airbnb-ical'), schedule := '7,37 * * * *');
select schedule from cron.job where jobname = 'mgm-airbnb-ical';
