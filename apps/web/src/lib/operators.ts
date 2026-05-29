export const OPERATORS = [
  { slug: 'ypf',           name: 'YPF',                      category: 'producer',        country: 'AR', website: 'https://www.ypf.com',             description: 'Mayor productora de oil & gas de Argentina.' },
  { slug: 'pae',           name: 'Pan American Energy',       category: 'producer',        country: 'AR', website: 'https://www.pan-energy.com',      description: 'Productora privada líder, op. en Vaca Muerta y Golfo San Jorge.' },
  { slug: 'vista_energy',  name: 'Vista Energy',              category: 'producer',        country: 'AR', website: 'https://www.vistaenergy.com',     description: 'Foco en Vaca Muerta; cotiza en NYSE y BMV.' },
  { slug: 'tecpetrol',     name: 'Tecpetrol',                 category: 'producer',        country: 'AR', website: 'https://www.tecpetrol.com',       description: 'Subsidiaria del Grupo Techint; operadora en Fortín de Piedra.' },
  { slug: 'totalenergies', name: 'TotalEnergies',             category: 'integrated',      country: 'FR', website: 'https://totalenergies.com',       description: 'Integrada global con operaciones en Vaca Muerta.' },
  { slug: 'shell',         name: 'Shell Argentina',           category: 'integrated',      country: 'NL', website: 'https://www.shell.com.ar',        description: 'Integrada con presencia en exploración y downstream.' },
  { slug: 'chevron',       name: 'Chevron Argentina',         category: 'producer',        country: 'US', website: 'https://www.chevron.com',         description: 'Socio de YPF en Vaca Muerta.' },
  { slug: 'pluspetrol',    name: 'Pluspetrol',                category: 'producer',        country: 'AR', website: 'https://www.pluspetrol.net',      description: 'Productora con operaciones en cuencas argentinas.' },
  { slug: 'cgc',           name: 'CGC',                       category: 'producer',        country: 'AR', website: 'https://www.cgc.com.ar',          description: 'Compañía General de Combustibles.' },
  { slug: 'pampa',         name: 'Pampa Energía',             category: 'integrated',      country: 'AR', website: 'https://www.pampaenergia.com',    description: 'Integrada argentina: generación, transmisión y O&G.' },
  { slug: 'slb',           name: 'SLB',                       category: 'service_company', country: 'US', website: 'https://www.slb.com',             description: 'Mayor empresa de servicios oilfield del mundo.' },
  { slug: 'halliburton',   name: 'Halliburton',               category: 'service_company', country: 'US', website: 'https://www.halliburton.com',     description: 'Empresa de servicios oilfield global.' },
  { slug: 'baker_hughes',  name: 'Baker Hughes',              category: 'service_company', country: 'US', website: 'https://www.bakerhughes.com',     description: 'Tecnología y servicios para el sector energético.' },
  { slug: 'weatherford',   name: 'Weatherford',               category: 'service_company', country: 'US', website: 'https://www.weatherford.com',     description: 'Servicios y equipamiento para perforación.' },
  { slug: 'techint',       name: 'Techint',                   category: 'service_company', country: 'AR', website: 'https://www.techint.com',         description: 'Ingeniería y construcción para O&G.' },
  { slug: 'aesa',          name: 'AESA',                      category: 'service_company', country: 'AR', website: 'https://www.aesa.com.ar',         description: 'Servicios de construcción para hidrocarburos.' },
  { slug: 'sacde',         name: 'SACDE',                     category: 'service_company', country: 'AR', website: 'https://www.sacde.com',           description: 'Empresa constructora para proyectos energéticos.' },
  { slug: 'pecom',         name: 'Pecom',                     category: 'service_company', country: 'AR', website: 'https://www.pecomenergia.com.ar', description: 'Servicios industriales para petróleo y gas.' },
  { slug: 'san_antonio',   name: 'San Antonio Internacional', category: 'service_company', country: 'AR', website: 'https://www.sanantonio.com.ar',   description: 'Servicios integrales de perforación y completación.' },
  { slug: 'calfrac',       name: 'Calfrac',                   category: 'service_company', country: 'CA', website: 'https://www.calfrac.com',         description: 'Servicios de fractura hidráulica.' },
] as const

export type Operator = typeof OPERATORS[number]

export const OPERATOR_MAP: Record<string, Operator> = Object.fromEntries(
  OPERATORS.map(o => [o.slug, o])
)

// Keywords to match against article titles in the old `articles` table
export const OPERATOR_KEYWORDS: Record<string, string[]> = {
  ypf:           ['ypf'],
  pae:           ['pan american energy', 'pan american'],
  vista_energy:  ['vista energy', 'vista oil & gas'],
  tecpetrol:     ['tecpetrol'],
  totalenergies: ['totalenergies', 'total energies', 'total argentina'],
  shell:         ['shell argentina'],
  chevron:       ['chevron'],
  pluspetrol:    ['pluspetrol'],
  cgc:           ['compañía general de combustibles'],
  pampa:         ['pampa energía', 'pampa energia', 'pampa energy'],
  slb:           ['schlumberger', 'slb'],
  halliburton:   ['halliburton'],
  baker_hughes:  ['baker hughes'],
  weatherford:   ['weatherford'],
  techint:       ['techint'],
  aesa:          ['aesa'],
  sacde:         ['sacde'],
  pecom:         ['pecom'],
  san_antonio:   ['san antonio internacional'],
  calfrac:       ['calfrac'],
}
