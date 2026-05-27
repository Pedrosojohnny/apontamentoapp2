/**
 * data.js — Static demo/seed data.
 *
 * Used as a fallback when the IndexedDB has no imported master data yet
 * (e.g. first launch on a new origin, before the Excel is imported).
 * Auth always reads from here; db.js checks here only when the DB is empty.
 *
 * Replace this with your real data by importing the PCP spreadsheet via the
 * Admin panel → "Importar Planilha Excel". Imported data always takes priority.
 */

window.BAUER_DATA = {
    operators: [
        { codigo: "1234", nome: "João Silva" },
        { codigo: "5678", nome: "Maria Oliveira" }
    ],

    // Demo orders — must include itemCode so routings can be looked up
    orders: [
        { op: "88234", itemCode: "PABB2", descricao: "Painel ABB - Tipo 2",  quantidade: 10 },
        { op: "88235", itemCode: "PSS7",  descricao: "Painel Siemens S7",    quantidade: 5  }
    ],

    // Demo routings — used when no routings are found in IndexedDB for an item
    routings: [
        { itemCode: "PABB2", sequencia: 10, operacao: "Montagem Mecânica"  },
        { itemCode: "PABB2", sequencia: 20, operacao: "Montagem Elétrica"  },
        { itemCode: "PABB2", sequencia: 30, operacao: "Inspeção Final"      },
        { itemCode: "PSS7",  sequencia: 10, operacao: "Montagem Mecânica"  },
        { itemCode: "PSS7",  sequencia: 20, operacao: "Montagem Elétrica"  }
    ]
};
