-- Category names are unique after trimming/case folding across active and inactive rows.
CREATE UNIQUE INDEX "categories_normalized_name_key" ON "categories" (lower(btrim("name")));
