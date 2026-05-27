/**
 * auth.js — Operator authentication.
 *
 * Validates against the operator list in BAUER_DATA (data.js).
 * Falls back to accepting any ID when the list is empty so the app
 * remains usable during initial setup before master data is loaded.
 *
 * Exposed as `window.Auth`.
 */

const Auth = {
    currentOperators: [],
    
    validateOperator(id) {
        const data = window.BAUER_DATA || { operators: [] };
        // If data is empty, allow any ID for testing (fallback)
        if (data.operators.length === 0) {
            return { codigo: id, nome: `Operador ${id}` };
        }
        
        return data.operators.find(op => op.codigo.toString() === id.toString());
    },

    login(id) {
        const operator = this.validateOperator(id);
        if (operator) {
            // Add to active line if not already there
            if (!this.currentOperators.find(o => o.codigo === operator.codigo)) {
                this.currentOperators.push(operator);
            }
            return operator;
        }
        return null;
    }
};

window.Auth = Auth;
