"""Aplica la paleta del Manual de Marca Keicy (negro #000000, oro #FFAC48, blanco #FFFFFF).

Reemplaza los dorados heredados de Diego Neira por la familia oro de Keicy y
neutraliza los grises azulados a negro. Es idempotente: correrlo de nuevo
después de sincronizar con DN solo toca los colores que hayan vuelto a entrar.

Uso: python scripts/aplicar-marca-keicy.py
"""
import re
import subprocess

ORO = 'FFAC48'          # Pantone 1365 C
ORO_BRIGHT = 'FFC27A'
ORO_DARK = 'CC7A14'
ORO_PALIDO = 'FFD9A8'
ORO_SOFT = 'FFF4E6'

HEX = {
    # Dorado principal -> oro
    **dict.fromkeys(['D4AF55', 'C9A35B', 'D9B872', 'D4AF37', 'CFAE45', 'D4A853', 'D6AE4A',
                     'C8A05A', 'E5C066', 'B8942A', 'C9A227', 'D4A845', 'E0BC76', 'C9A535',
                     'E8C547', 'FFD700'], ORO),
    # Dorado brillante -> oro claro
    **dict.fromkeys(['E8C66A', 'D4B06A', 'E5C158', 'F0D080', 'E8C87A', 'E6CB90', 'F5D373',
                     'F4D03F'], ORO_BRIGHT),
    # Dorado oscuro -> oro profundo
    **dict.fromkeys(['B8860B', 'B8923A', 'C49B35', 'C9A55A', 'A8864A', 'D4A855', '9A7A20',
                     'A8863D', 'B8963F'], ORO_DARK),
    'E8D5A3': ORO_PALIDO,
    # Fondos dorados suaves (tema claro)
    **dict.fromkeys(['FDF8ED', 'F5EDD8', 'F7F1E4'], ORO_SOFT),
    # Negros azulados -> negro neutro
    '0A0A0C': '000000',
    '101112': '0E0E0E',
    '16181D': '141414',
    '1C1E24': '1C1C1C',
    '2A2D35': '2A2A2A',
    '1A1A2E': '1A1A1A',
    # Texto crema -> blanco de marca
    'F5F2EA': 'FFFFFF',
}

def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

RGB = {
    **dict.fromkeys([(201, 163, 91), (217, 184, 114), (200, 160, 90), (212, 175, 85),
                     (212, 168, 83), (212, 175, 55), (201, 164, 92), (207, 174, 69),
                     (201, 162, 39), (214, 174, 85), (255, 215, 0)], rgb(ORO)),
    (232, 213, 163): rgb(ORO_PALIDO),
    (10, 10, 12): (0, 0, 0),
    (16, 17, 18): (14, 14, 14),
    (22, 24, 29): (20, 20, 20),
    (245, 242, 234): (255, 255, 255),
}

HEX_RE = re.compile(r'#([0-9a-fA-F]{6})(?![0-9a-fA-F])')
RGB_RE = re.compile(r'(rgba?\(\s*)(\d+)(\s*,\s*)(\d+)(\s*,\s*)(\d+)')

def sub_hex(m):
    new = HEX.get(m.group(1).upper())
    return '#' + new if new else m.group(0)

def sub_rgb(m):
    new = RGB.get((int(m.group(2)), int(m.group(4)), int(m.group(6))))
    if not new:
        return m.group(0)
    return f'{m.group(1)}{new[0]}{m.group(3)}{new[1]}{m.group(5)}{new[2]}'

def main():
    files = subprocess.check_output(
        ['git', 'ls-files', '*.html', '*.css', '*.js', '*.ts', '*.json'], text=True).split()
    changed = 0
    for f in files:
        with open(f, encoding='utf-8', newline='') as fh:
            src = fh.read()
        out = RGB_RE.sub(sub_rgb, HEX_RE.sub(sub_hex, src))
        if out != src:
            with open(f, 'w', encoding='utf-8', newline='') as fh:
                fh.write(out)
            changed += 1
            print('  ', f)
    print(f'{changed} archivos actualizados')

if __name__ == '__main__':
    main()
