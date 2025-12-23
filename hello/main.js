function gristHelloWidget() {
  return {
    // === ÉTAT ===
    tableId: null,
    rows: [], // {id, Name, Done, CreatedAt}
    filter: "",
    selectedRowId: null, // sélection Grist en cours
    selectedIds: new Set(), // sélection locale pour actions en lot
    newName: "",

    // === INIT ===
    async init() {
      // Accès table + synchro en direct si “table entière” mappée
      grist.ready({ requiredAccess: "read table" });

      grist.onRecords((records, mappings) => {
        if (mappings?.tableId) this.tableId = mappings.tableId;
        this.rows = (records || []).map((r) => ({
          id: r.id,
          Name: r.Name ?? r.name ?? "",
          Done: !!(r.Done ?? r.done ?? false),
          CreatedAt: r.CreatedAt ?? r.created_at ?? null,
        }));
        // Réinitialise la sélection locale sur rechargement
        this.selectedIds.clear();
      });

      grist.onSelection((sel) => {
        this.selectedRowId = sel?.rowId ?? sel?.rowIds?.[0] ?? null;
      });
    },

    // === VUE / TRI / FILTRE ===
    invalidateFilter() {
      // Méthode vide : juste pour être appelée par htmx (keyup.debounce) et
      // déclencher une ré-évaluation Alpine (x-model fait le reste).
    },

    viewRows() {
      // Filtre simple + tri stable par Name puis id
      const f = (this.filter || "").toLowerCase();
      const arr = this.rows.filter((r) =>
        String(r.Name).toLowerCase().includes(f)
      );
      arr.sort((a, b) => {
        const an = (a.Name || "").toLowerCase();
        const bn = (b.Name || "").toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return (a.id || 0) - (b.id || 0);
      });
      return arr;
    },

    // === SÉLECTION LOCALE ===
    toggleSelect(id, checked) {
      if (checked) this.selectedIds.add(id);
      else this.selectedIds.delete(id);
    },
    allChecked() {
      const v = this.viewRows();
      return v.length > 0 && v.every((r) => this.selectedIds.has(r.id));
    },
    toggleAll(checked) {
      const v = this.viewRows();
      if (checked) v.forEach((r) => this.selectedIds.add(r.id));
      else v.forEach((r) => this.selectedIds.delete(r.id));
    },

    // === FORMATS ===
    formatDate(v) {
      if (!v) return "—";
      try {
        return new Date(v).toLocaleString();
      } catch {
        return String(v);
      }
    },

    // === CHARGEMENT MANUEL (fallback) ===
    async refresh() {
      if (!this.tableId) return;
      const table = await grist.docApi.fetchTable(this.tableId);
      const ids = table.id || [];
      const names = table.Name || [];
      const dones = table.Done || [];
      const created = table.CreatedAt || [];
      this.rows = ids.map((id, i) => ({
        id,
        Name: names[i] ?? "",
        Done: !!(dones[i] ?? false),
        CreatedAt: created[i] ?? null,
      }));
      this.selectedIds.clear();
    },

    // === CRUD ===
    async addQuick() {
      if (!this.tableId || !this.newName.trim()) return;
      const fields = {
        Name: this.newName.trim(),
        Done: false,
        CreatedAt: new Date().toISOString(),
      };
      await grist.docApi.applyUserActions([
        ["AddRecord", this.tableId, fields],
      ]);
      this.newName = "";
      await this.refresh();
    },

    async save(id, patch) {
      if (!this.tableId || !id) return;
      await grist.docApi.applyUserActions([
        ["UpdateRecord", this.tableId, id, patch],
      ]);
      // Optimiste: on met à jour en mémoire sans re-fetch complet
      const row = this.rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },

    async duplicate(row) {
      if (!this.tableId || !row) return;
      const fields = { ...row };
      delete fields.id;
      await grist.docApi.applyUserActions([
        ["AddRecord", this.tableId, fields],
      ]);
      await this.refresh();
    },

    async remove(id) {
      if (!this.tableId || !id) return;
      await grist.docApi.applyUserActions([["RemoveRecord", this.tableId, id]]);
      await this.refresh();
    },

    // === ACTIONS EN LOT ===
    async bulkToggleDone(doneValue) {
      if (!this.tableId) return;
      const ids = Array.from(this.selectedIds);
      if (ids.length === 0) return;

      // Utilise l’opération de mise à jour en lot (si dispo) sinon boucle
      // La forme courte ci-dessous fonctionne sur la plupart des versions :
      await grist.docApi
        .applyUserActions([
          ["BulkUpdateRecord", this.tableId, ids, { Done: !!doneValue }],
        ])
        .catch(async () => {
          // fallback si BulkUpdateRecord indisponible:
          const actions = ids.map((id) => [
            "UpdateRecord",
            this.tableId,
            id,
            { Done: !!doneValue },
          ]);
          await grist.docApi.applyUserActions(actions);
        });

      await this.refresh();
    },

    // === NAVIGATION ===
    selectInGrist(id) {
      if (!id) return;
      grist.setCursorPos({ rowId: id });
    },
  };
}
