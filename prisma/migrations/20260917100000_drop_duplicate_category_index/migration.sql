-- The canonical-name check guarantees names are trimmed, so this older index
-- duplicates categories_normalized_name_key from the follow-up migration.
DROP INDEX "categories_name_normalized_key";
