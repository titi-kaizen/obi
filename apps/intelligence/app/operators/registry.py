"""
Operator registry — canonical company information.
Mirrors the NLP operator detector but enriched with metadata.
"""
from dataclasses import dataclass, field


@dataclass
class Operator:
    slug: str
    name: str
    aliases: list[str]
    category: str    # producer | service_company | integrated
    country: str = "AR"
    website: str = ""
    description: str = ""


OPERATORS: list[Operator] = [
    Operator("ypf", "YPF", ["ypf", "yacimientos petrolíferos fiscales"],
             "producer", website="https://www.ypf.com",
             description="Mayor productora de oil & gas de Argentina."),
    Operator("pae", "Pan American Energy", ["pan american energy", "pae"],
             "producer", website="https://www.pan-energy.com",
             description="Productora privada líder en Argentina, op. en Vaca Muerta y Golfo San Jorge."),
    Operator("vista_energy", "Vista Energy", ["vista energy", "vista oil & gas"],
             "producer", website="https://www.vistaenergy.com",
             description="Foco en Vaca Muerta; cotiza en NYSE y BMV."),
    Operator("tecpetrol", "Tecpetrol", ["tecpetrol"],
             "producer", website="https://www.tecpetrol.com",
             description="Subsidiaria del Grupo Techint; operadora en Fortín de Piedra."),
    Operator("totalenergies", "TotalEnergies", ["totalenergies", "total energies", "total argentina"],
             "integrated", country="FR", website="https://totalenergies.com/argentina"),
    Operator("shell", "Shell Argentina", ["shell argentina", "shell"],
             "integrated", country="NL", website="https://www.shell.com.ar"),
    Operator("chevron", "Chevron Argentina", ["chevron argentina", "chevron"],
             "producer", country="US", website="https://www.chevron.com/worldwide/argentina"),
    Operator("pluspetrol", "Pluspetrol", ["pluspetrol"],
             "producer", website="https://www.pluspetrol.net"),
    Operator("cgc", "CGC", ["cgc", "compañía general de combustibles"],
             "producer", website="https://www.cgc.com.ar"),
    Operator("pampa", "Pampa Energía", ["pampa energía", "pampa energia"],
             "integrated", website="https://www.pampaenergia.com"),
    Operator("slb", "SLB", ["slb", "schlumberger"],
             "service_company", country="US", website="https://www.slb.com",
             description="Mayor empresa de servicios oilfield del mundo."),
    Operator("halliburton", "Halliburton", ["halliburton"],
             "service_company", country="US", website="https://www.halliburton.com"),
    Operator("baker_hughes", "Baker Hughes", ["baker hughes", "bhge"],
             "service_company", country="US", website="https://www.bakerhughes.com"),
    Operator("weatherford", "Weatherford", ["weatherford"],
             "service_company", country="US", website="https://www.weatherford.com"),
    Operator("techint", "Techint", ["techint", "techint ingeniería & construcción"],
             "service_company", website="https://www.techint.com"),
    Operator("aesa", "AESA", ["aesa"],
             "service_company", website="https://www.aesa.com.ar"),
    Operator("sacde", "SACDE", ["sacde"],
             "service_company", website="https://www.sacde.com"),
    Operator("pecom", "Pecom", ["pecom", "pecom energía"],
             "service_company", website="https://www.pecomenergia.com.ar"),
    Operator("san_antonio", "San Antonio Internacional", ["san antonio", "san antonio internacional"],
             "service_company", website="https://www.sanantonio.com.ar"),
    Operator("calfrac", "Calfrac", ["calfrac"],
             "service_company", country="CA", website="https://www.calfrac.com"),
]

_BY_SLUG: dict[str, Operator] = {op.slug: op for op in OPERATORS}


def get_operator(slug: str) -> Operator | None:
    return _BY_SLUG.get(slug)


def list_operators() -> list[Operator]:
    return list(OPERATORS)


def list_slugs() -> list[str]:
    return list(_BY_SLUG.keys())
