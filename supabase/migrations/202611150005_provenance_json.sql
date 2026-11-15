-- Repair the prior postgres.js transport's JSON-string envelope without changing evidence content.
update private.legacy_comment_records set raw_record=(raw_record#>>'{}')::jsonb where jsonb_typeof(raw_record)='string';
update private.feature_imports set raw_record=(raw_record#>>'{}')::jsonb where jsonb_typeof(raw_record)='string';
update private.control_events set previous=(previous#>>'{}')::jsonb where jsonb_typeof(previous)='string';
update private.control_events set next=(next#>>'{}')::jsonb where jsonb_typeof(next)='string';
alter table private.legacy_comment_records add check(jsonb_typeof(raw_record)='object');
alter table private.feature_imports add check(jsonb_typeof(raw_record)='object');
alter table private.control_events add check(jsonb_typeof(previous)='object' and jsonb_typeof(next)='object');
