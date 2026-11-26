const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const postImagePath = new RegExp(`^${uuid}/${uuid}\\.webp$`);
export const maxPostFileBytes = 52428800;
export const postMediaPath = new RegExp(`^${uuid}/${uuid}\\.(webp|jpg|mp4|webm|mov)$`);
