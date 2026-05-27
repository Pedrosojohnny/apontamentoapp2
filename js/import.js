/**
 * import.js — Excel master data importer.
 *
 * Reads an .xlsx file with two sheets (Orders and Routings), maps columns
 * using fuzzy name matching to handle variations in the PCP spreadsheet format,
 * then saves the result to IndexedDB via window.db.saveMasterData().
 *
 * Column matching is intentionally lenient: it tries exact normalized matches
 * first, then partial matches. This makes the import resilient to minor header
 * changes in the source spreadsheet without requiring code changes.
 *
 * Exposed as `window.importer`.
 */

class DataImporter {
    constructor() {
        this.isImporting = false;
    }

    async importFromExcel(file) {
        if (this.isImporting) return;
        this.isImporting = true;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // 1. Processar Aba de Ordens (Tenta achar por nome ou pega a primeira)
                    const ordersSheetName = workbook.SheetNames.find(n => 
                        n.toLowerCase().includes('ordem') || n.toLowerCase().includes('om')
                    ) || workbook.SheetNames[0];
                    
                    const ordersSheet = workbook.Sheets[ordersSheetName];
                    const rawOrders = XLSX.utils.sheet_to_json(ordersSheet);

                    // 2. Processar Aba de Roteiros (Tenta achar por nome ou pega a segunda)
                    const routingsSheetName = workbook.SheetNames.find(n => 
                        n.toLowerCase().includes('roteiro') || n.toLowerCase().includes('item')
                    ) || workbook.SheetNames[1];
                    
                    const routingsSheet = workbook.Sheets[routingsSheetName];
                    const rawRoutings = routingsSheet ? XLSX.utils.sheet_to_json(routingsSheet) : [];

                    // Função auxiliar para buscar valor em colunas com nomes variados
                    const getVal = (row, markers) => {
                        const keys = Object.keys(row);
                        // 1. Tenta encontrar um "match" exato (normalizado)
                        const normalizedKeys = keys.map(k => ({
                            original: k,
                            normalized: k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
                        }));

                        // Prioridade para matches exatos com os marcadores
                        for (const marker of markers) {
                            const exactMatch = normalizedKeys.find(nk => nk.normalized === marker);
                            if (exactMatch) return row[exactMatch.original];
                        }

                        // Segundo nível: matches parciais (contém o marcador)
                        for (const marker of markers) {
                            const partialMatch = normalizedKeys.find(nk => nk.normalized.includes(marker));
                            if (partialMatch) return row[partialMatch.original];
                        }
                        
                        return null;
                    };

                    // 3. Mapeamento de Ordens
                    const mappedOrders = rawOrders.map(row => {
                        let om = (getVal(row, ['om', 'ordem', 'numeroom', 'op']) || '').toString().trim();
                        // Strip leading zeros for canonical matching
                        om = om.replace(/^0+/, '') || '0';

                        let itemCode = (getVal(row, ['codigodoitem', 'itemcode', 'item', 'codigo', 'referencia']) || '').toString().trim();
                        itemCode = itemCode.replace(/^0+/, '') || '0';

                        const desc = (getVal(row, ['descricao', 'desc', 'nome', 'produto']) || `Item ${itemCode}`).toString().trim();
                        const qty = parseInt(getVal(row, ['quantidade', 'qtd', 'quant', 'total']) || 0);

                        return { om, itemCode, descricao: desc, quantidade: qty };
                    }).filter(o => o.om && o.itemCode);

                    // 4. Mapeamento de Roteiros
                    const mappedRoutings = rawRoutings.map(row => {
                        let itemCode = (getVal(row, ['codigodoitem', 'itemcode', 'item', 'codigo', 'referencia']) || '').toString().trim();
                        itemCode = itemCode.replace(/^0+/, '') || '0';

                        // Ajuste: Removido 'desc' para não confundir com Descrição do Item
                        const operacao = (getVal(row, ['operacao', 'operacoes', 'descricaodeoperacao', 'etapa']) || '').toString().trim();
                        const seq = getVal(row, ['sequencia', 'seq', 'ordem', 'passo']) || 0;
                        
                        return { itemCode, sequencia: seq, operacao };
                    }).filter(r => {
                        if (!r.itemCode || !r.operacao) return false;
                        const op = r.operacao.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        const isTeste = op.includes('TESTE');
                        const isDistribuicao = op.includes('DISTRIBUICAO');
                        return !isTeste && !isDistribuicao;
                    });

                    // 5. Salvar no IndexedDB
                    await window.db.saveMasterData(mappedOrders, mappedRoutings);
                    
                    this.isImporting = false;
                    resolve({ 
                        ordersCount: mappedOrders.length, 
                        routingsCount: mappedRoutings.length 
                    });
                } catch (error) {
                    this.isImporting = false;
                    console.error('Erro na importação:', error);
                    reject(error);
                }
            };

            reader.onerror = (err) => {
                this.isImporting = false;
                reject(err);
            };

            reader.readAsArrayBuffer(file);
        });
    }
}

window.importer = new DataImporter();
