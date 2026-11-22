-- Child jobs/events must belong to the owner of their parent. A user_id-only
-- RLS policy cannot enforce this when a foreign key references a global UUID.
alter table uploads add constraint uploads_owner_id_unique unique (user_id, id);
alter table ingestion_jobs add constraint ingestion_jobs_owner_id_unique unique (user_id, id);

alter table ingestion_jobs drop constraint ingestion_jobs_upload_id_fkey;
alter table ingestion_jobs add constraint ingestion_jobs_upload_owner_fkey
  foreign key (user_id, upload_id) references uploads(user_id, id) on delete cascade;

alter table ingestion_events drop constraint ingestion_events_job_id_fkey;
alter table ingestion_events add constraint ingestion_events_job_owner_fkey
  foreign key (user_id, job_id) references ingestion_jobs(user_id, id) on delete cascade;
