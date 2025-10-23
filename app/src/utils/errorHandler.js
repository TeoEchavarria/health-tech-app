/**
 * Centralized error handling system for API calls
 * Provides error classification, user-friendly messages, and detailed logging
 */

export class ApiError {
  constructor(originalError, context = {}) {
    this.timestamp = new Date().toISOString();
    this.context = context; // { endpoint, method, recordType, etc }
    this.originalError = originalError;
    
    // Clasificar el error
    this.type = this.classifyError(originalError);
    this.statusCode = originalError.response?.status;
    this.message = this.extractMessage(originalError);
    this.userMessage = this.generateUserMessage();
    
    // Información técnica detallada
    this.details = {
      endpoint: context.endpoint || originalError.config?.url,
      method: context.method || originalError.config?.method?.toUpperCase(),
      baseURL: originalError.config?.baseURL,
      headers: this.sanitizeHeaders(originalError.config?.headers),
      requestData: this.sanitizeData(context.requestData),
      responseData: this.sanitizeData(originalError.response?.data),
    };
  }
  
  classifyError(error) {
    if (!error.response && error.request) return 'NETWORK';
    if (error.response?.status === 401 || error.response?.status === 403) return 'AUTH';
    if (error.response?.status >= 500) return 'SERVER';
    if (error.response?.status >= 400) return 'VALIDATION';
    if (error.code === 'ECONNABORTED') return 'TIMEOUT';
    return 'UNKNOWN';
  }
  
  extractMessage(error) {
    // Priorizar mensajes del servidor
    if (error.response?.data?.detail) return error.response.data.detail;
    if (error.response?.data?.message) return error.response.data.message;
    if (error.response?.data?.error) return error.response.data.error;
    
    // Mensajes de Axios
    if (error.message) return error.message;
    
    return 'Error desconocido';
  }
  
  generateUserMessage() {
    const messages = {
      NETWORK: {
        title: 'Sin conexión al servidor',
        description: 'No se puede conectar con el servidor. Verifica tu conexión a internet.',
        severity: 'error'
      },
      AUTH: {
        title: 'Sesión expirada',
        description: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
        severity: 'error'
      },
      SERVER: {
        title: 'Error del servidor',
        description: 'El servidor está experimentando problemas. Inténtalo más tarde.',
        severity: 'error'
      },
      VALIDATION: {
        title: 'Datos inválidos',
        description: 'Los datos enviados no son válidos. Verifica la información.',
        severity: 'warning'
      },
      TIMEOUT: {
        title: 'Tiempo de espera agotado',
        description: 'La solicitud tardó demasiado. Verifica tu conexión.',
        severity: 'warning'
      },
      UNKNOWN: {
        title: 'Error inesperado',
        description: 'Ocurrió un error inesperado. Inténtalo nuevamente.',
        severity: 'error'
      }
    };
    
    return messages[this.type] || messages.UNKNOWN;
  }
  
  sanitizeHeaders(headers) {
    if (!headers) return {};
    
    const sanitized = { ...headers };
    
    // Remover información sensible
    if (sanitized.Authorization) {
      sanitized.Authorization = '[REDACTED]';
    }
    if (sanitized['X-API-Key']) {
      sanitized['X-API-Key'] = '[REDACTED]';
    }
    
    return sanitized;
  }
  
  sanitizeData(data) {
    if (!data) return null;
    
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Remover campos sensibles
    const sensitiveFields = ['password', 'token', 'refresh', 'secret', 'key'];
    
    function sanitizeObject(obj) {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      for (const key in obj) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        }
      }
    }
    
    sanitizeObject(sanitized);
    return sanitized;
  }
  
  toLogString() {
    return `[${this.type}] ${this.details.method} ${this.details.endpoint} - ${this.message}`;
  }
  
  toDetailedLog() {
    return {
      timestamp: this.timestamp,
      type: this.type,
      statusCode: this.statusCode,
      message: this.message,
      endpoint: this.details.endpoint,
      method: this.details.method,
      baseURL: this.details.baseURL,
      context: this.context,
      userMessage: this.userMessage
    };
  }
}

/**
 * Utility function to create a standardized error log
 */
export function logApiError(error, context = {}) {
  const apiError = error instanceof ApiError ? error : new ApiError(error, context);
  
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('🔴 API REQUEST FAILED');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error(`Type:     ${apiError.type}`);
  console.error(`Method:   ${apiError.details.method}`);
  console.error(`URL:      ${apiError.details.baseURL}${apiError.details.endpoint}`);
  console.error(`Status:   ${apiError.statusCode || 'No response'}`);
  console.error(`Message:  ${apiError.message}`);
  console.error(`Context:  ${JSON.stringify(apiError.context, null, 2)}`);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Diagnóstico específico para errores de red
  if (apiError.type === 'NETWORK') {
    console.error('🔍 Network Diagnostics:');
    console.error(`   • Base URL: ${apiError.details.baseURL}`);
    console.error(`   • Error Code: ${apiError.originalError.code || 'N/A'}`);
    console.error(`   • Error Message: ${apiError.originalError.message}`);
    console.error('   ⚠️  Possible causes:');
    console.error('      - Backend server not running');
    console.error('      - Network connectivity issues');
    console.error('      - Firewall or VPN blocking connection');
    console.error('      - SSL/Certificate problems');
    console.error('      - DNS resolution issues');
  }
  
  return apiError;
}

