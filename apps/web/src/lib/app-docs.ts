// Central documentation config.
// Add or update entries here whenever a new feature ships.

export interface DocSection {
  id:          string
  title:       string
  subtitle:    string
  icon:        string        // lucide icon name
  status:      'live' | 'beta' | 'coming_soon'
  description: string        // 2-3 sentences: what it is
  howItWorks:  string[]      // bullet list: how the system works internally
  useCases:    string[]      // bullet list: what the user can do / decide with it
  path:        string        // nav link
  updatedAt:   string        // YYYY-MM-DD — update when the section changes
}

export const APP_DOCS: DocSection[] = [
  {
    id:       'dashboard',
    title:    'Dashboard',
    subtitle: 'Centro de monitoreo en tiempo real',
    icon:     'LayoutDashboard',
    status:   'live',
    path:     '/',
    updatedAt:'2026-05-31',
    description:
      'Vista central del estado de la plataforma. Muestra el flujo de artículos desde el scraping hasta la clasificación, las señales activas y el estado de salud de las fuentes configuradas.',
    howItWorks: [
      'Se conecta en tiempo real a la base de datos y muestra contadores actualizados cada 30 segundos.',
      'El botón "Clasificar pendientes" lanza el pipeline de IA en loop hasta procesar todos los artículos scraped.',
      'Los artículos se clasifican por categoría, sentimiento y score de relevancia (0–100%) usando Groq LLaMA 3.3 70B.',
    ],
    useCases: [
      'Ver cuántos artículos nuevos entró el scraper hoy.',
      'Detectar si hay artículos atascados en el pipeline y resolverlos.',
      'Monitorear la distribución temática del flujo de noticias (upstream, midstream, regulación, etc.).',
    ],
  },
  {
    id:       'articles',
    title:    'Artículos',
    subtitle: 'Base de noticias clasificadas',
    icon:     'Newspaper',
    status:   'live',
    path:     '/articles',
    updatedAt:'2026-05-31',
    description:
      'Repositorio completo de todas las noticias scrapeadas y clasificadas. Cada artículo tiene categoría, sentimiento, score de relevancia, keywords extraídas y resumen automático generado por IA.',
    howItWorks: [
      'El scraper recorre las fuentes configuradas (RSS y HTML) cada vez que se ejecuta desde Fuentes o Dashboard.',
      'Los artículos nuevos entran con status "scraped" y esperan ser procesados por el pipeline de IA.',
      'La IA asigna: categoría O&G, sentimiento, relevance_score, keywords, resumen en español y operadoras mencionadas.',
    ],
    useCases: [
      'Buscar noticias sobre un tema específico (ej: "Vaca Muerta", "LNG").',
      'Filtrar artículos por operadora, categoría o nivel de relevancia.',
      'Acceder al artículo original desde la fuente.',
    ],
  },
  {
    id:       'operadoras',
    title:    'Operadoras',
    subtitle: '20 compañías O&G Argentina monitoreadas',
    icon:     'Building2',
    status:   'live',
    path:     '/operadoras',
    updatedAt:'2026-05-31',
    description:
      'Monitoreo individualizado de las 20 principales compañías del sector Oil & Gas Argentina: productoras, integradas y empresas de servicios. Cada perfil agrupa las noticias detectadas y el sentimiento dominante.',
    howItWorks: [
      'El pipeline de clasificación detecta menciones de operadoras usando keywords configuradas en lib/operators.ts.',
      'Cada artículo puede estar asociado a una o más operadoras (campo operator_slugs).',
      'Los briefs de operadoras se generan con contexto específico de cada compañía.',
    ],
    useCases: [
      'Ver qué operadoras tienen más actividad noticiosa en un período.',
      'Evaluar el sentimiento dominante (positivo/negativo/neutral) para una compañía.',
      'Acceder al detalle de noticias recientes de una operadora específica.',
    ],
  },
  {
    id:       'market',
    title:    'Market Intelligence',
    subtitle: 'Cost Intelligence & Supply Chain Pressure Engine',
    icon:     'BarChart3',
    status:   'beta',
    path:     '/market',
    updatedAt:'2026-05-31',
    description:
      'Nueva capa de inteligencia que transforma noticias en señales accionables para Planeamiento Estratégico, Supply Chain y Procurement. Detecta contratos, licitaciones e inversiones anunciadas, y calcula un índice de presión sobre costos en tiempo real.',
    howItWorks: [
      'El botón "Extraer Contratos" corre un pipeline de IA sobre los artículos clasificados y extrae eventos contractuales estructurados (operadora, proveedor, monto, categoría, ubicación).',
      'El Supply Chain Pressure Index (0–100) combina: volumen de contratos, inversiones anunciadas, actividad upstream, operadoras activas y relevancia del flujo de noticias.',
      '"Generar Insights" usa Groq para producir análisis narrativo estratégico sobre tendencias de mercado, presión de costos y outlook.',
    ],
    useCases: [
      '¿Qué servicios podrían encarecerse en los próximos meses?',
      '¿Qué operadoras están más activas en contratación?',
      '¿Dónde podrían aparecer cuellos de botella en la cadena de suministro?',
      'Anticipar movimientos de mercado antes de que aparezcan en procesos formales de contratación.',
    ],
  },
  {
    id:       'briefs',
    title:    'Briefs Ejecutivos',
    subtitle: 'Informes diarios y semanales generados por IA',
    icon:     'FileText',
    status:   'live',
    path:     '/briefs',
    updatedAt:'2026-05-31',
    description:
      'Generación automática de informes ejecutivos diarios y semanales sobre el sector O&G Argentina. Cada brief sintetiza las noticias más relevantes del período en un formato accionable para decisiones de negocio.',
    howItWorks: [
      'El brief diario toma los artículos con relevance_score ≥ 0.35 de los últimos 7 días y los procesa con Groq LLaMA 3.3 70B.',
      'El brief semanal amplía el análisis a 80 artículos y agrega distribución por categoría y tendencias de la semana.',
      'Los briefs se guardan en la base de datos con fecha y se muestran en orden cronológico.',
    ],
    useCases: [
      'Recibir un resumen ejecutivo del sector O&G sin leer cada noticia individualmente.',
      'Identificar las 5 noticias más relevantes del día para una reunión de management.',
      'Hacer seguimiento semanal de tendencias: Vaca Muerta, precios, regulación, empresas.',
    ],
  },
  {
    id:       'signals',
    title:    'Señales',
    subtitle: 'Alertas automáticas sobre eventos de alto impacto',
    icon:     'Zap',
    status:   'live',
    path:     '/signals',
    updatedAt:'2026-05-31',
    description:
      'Las señales son eventos detectados automáticamente que superan cierto umbral de relevancia o corresponden a patrones predefinidos (por ejemplo: múltiples noticias negativas sobre una operadora, o un contrato de alto valor en una categoría sensible).',
    howItWorks: [
      'El sistema evalúa artículos recientes contra reglas de detección configuradas.',
      'Una señal activa permanece visible hasta que es resuelta o expira.',
      'Las señales tienen niveles de severidad: low, medium, high, critical.',
    ],
    useCases: [
      'Ser notificado cuando hay una concentración de noticias negativas sobre un proveedor clave.',
      'Detectar oportunidades: contratos grandes adjudicados en categorías de interés.',
      'Priorizar qué leer primero en el flujo de noticias.',
    ],
  },
  {
    id:       'sources',
    title:    'Fuentes',
    subtitle: 'Gestión de fuentes de noticias scrapeadas',
    icon:     'Database',
    status:   'live',
    path:     '/sources',
    updatedAt:'2026-05-31',
    description:
      'Administración de todas las fuentes de información monitoreadas: medios especializados O&G, portales de energía, feeds RSS de operadoras y organismos regulatorios. Muestra estado de salud, última actualización y cantidad de artículos por fuente.',
    howItWorks: [
      'El scraper soporta RSS (con autodiscovery) y scraping HTML para páginas sin feed.',
      'Cada fuente tiene prioridad, intervalo de scraping y categoría (national, international, operator, regulator).',
      'El botón "Scrapear todas" en el Dashboard ejecuta todas las fuentes activas en un solo ciclo.',
    ],
    useCases: [
      'Agregar una nueva fuente de noticias al monitoreo.',
      'Verificar si una fuente tiene errores recurrentes.',
      'Ver cuántos artículos aportó cada fuente.',
    ],
  },
  {
    id:       'alerts',
    title:    'Alertas',
    subtitle: 'Notificaciones por email, Slack o webhook',
    icon:     'Bell',
    status:   'live',
    path:     '/alerts',
    updatedAt:'2026-05-31',
    description:
      'Motor de notificaciones externas. Permite configurar reglas que disparan mensajes cuando se detectan señales de alto impacto, contratos relevantes u otros eventos definidos por el usuario.',
    howItWorks: [
      'Las reglas se configuran con condiciones (tipo de evento, operadora, categoría, score mínimo) y canales de envío.',
      'Cada disparo queda registrado con fecha y detalle del evento que lo activó.',
      'Soporta email, Slack webhook y HTTP webhook genérico.',
    ],
    useCases: [
      'Recibir un Slack cuando YPF anuncia una licitación nueva.',
      'Alertar al equipo de procurement cuando aparece actividad en una categoría monitoreada.',
      'Integrar con sistemas internos vía webhook.',
    ],
  },
  {
    id:       'pipeline',
    title:    'Pipeline',
    subtitle: 'Monitoreo del flujo de procesamiento',
    icon:     'Activity',
    status:   'live',
    path:     '/pipeline',
    updatedAt:'2026-05-31',
    description:
      'Vista técnica del estado del pipeline de datos: artículos por estado (scraped → parsing → completed / irrelevant / failed), tiempos de procesamiento y artículos atascados.',
    howItWorks: [
      'Cada artículo pasa por los estados: scraped → parsing → completed (relevante) o irrelevant (score < 0.15) o failed.',
      'Los artículos en "parsing" por más de 10 minutos se resetean automáticamente a "scraped".',
      'El dashboard muestra contadores en tiempo real y permite identificar cuellos de botella.',
    ],
    useCases: [
      'Diagnosticar por qué hay artículos que no avanzan en el pipeline.',
      'Verificar el throughput de clasificación (artículos por batch).',
      'Detectar fuentes que generan artículos irrelevantes de forma consistente.',
    ],
  },
]

export const APP_OVERVIEW = {
  name:        'OGAS — O&G Argentina Intelligence',
  tagline:     'Plataforma de inteligencia para el sector Oil & Gas Argentina',
  description: `OGAS monitorea continuamente el flujo de noticias del sector Oil & Gas Argentina, las clasifica con IA y transforma esa información en señales útiles para equipos de Planeamiento Estratégico, Supply Chain, Procurement e Infraestructura.

El sistema automatiza tres capas de análisis: (1) scraping y clasificación de noticias de 15+ fuentes especializadas, (2) detección de contratos, inversiones y licitaciones con extracción estructurada, y (3) síntesis ejecutiva mediante briefs diarios/semanales e índices de presión de mercado.`,
  stack: [
    'Next.js 16 + Supabase (PostgreSQL)',
    'Groq LLaMA 3.3 70B para clasificación y extracción',
    'Scraping RSS + HTML sin dependencias externas',
    'Desplegado en Vercel — ogas-pe.vercel.app',
  ],
}
