import { DrawMode } from "../types";

type CursorStyle = {
  image?: string,
  pointer?: {
    x: number,
    y: number,
  },
  default: string,
}

type CursorStylePack = Record<DrawMode, CursorStyle>;

const CURSOR_STYLE: CursorStylePack = {
  [DrawMode.DRAW]: {
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAARCAQAAACRZI9xAAAA1ElEQVR4Xq3NPQ4BURQF4FMgUfjZAi16jdYiKEWYQoRZAEOhkRGS1yhIRJjMLEEjmUb0ViER9SRy5GUiPPN07inPd+8FtMMEi0zruxBkaJ1EYDP3C6RodRyw7AczLWKave0SlCn7gR15Jy/Yq5uoHkJ0Fix8g2HXAfOXEHUcDphQwaC3D7cl2i5pKW8+gcx0zX4EmLs3MFyOmPkrANgYbt6grQGxxzx1VUAW6rBwEi/Q8jiOAIA1w5V18m7utADgpHJser54LGhoAUCTE9ZZYlxbA3gCk6KrqV6OZIIAAAAASUVORK5CYII=',
    pointer: {
      x: 1,
      y: 16,
    },
    default: 'crosshair',
  },
  [DrawMode.ERASE]: {
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAARCAQAAACYjy8LAAAAsUlEQVR4Xo3QIQ6DQBQE0O/pBRCwvheoaGoxKzgKGoMgqV1FRT2CIyDbpLYWxxE2qcZMsxtISf/f0hn7kkmGiAXpZE43AiGyQ4OcCwY3MBLURbfAHxhqMmX7uuyfG9hBN314iDhj0JXjeIQRoIR1j0qE3/h4nwzSAFxjDxX7keOimyERKt3L0LVsUftpT008hqCfTj4nZUMT2SBUtA5yCQtQxgG44J39A3qs0eA69yzBN0T/ElIyMMRvAAAAAElFTkSuQmCC',
    pointer: {
      x: 8,
      y: 16,
    },
    default: 'crosshair',
  },
  [DrawMode.PAN]: {
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAcCAYAAAB/E6/TAAAAAXNSR0IArs4c6QAABHZJREFUSA2VVl1Im1cYzo/5szXTON1We6FOL2REnBuudtVNVxV64ypDxYrMi2GQgiAMtwsZFLwq65X0SreqI4gbJYZljd28EOffcOq0TOYfrKJumRloXRrTxOx5Pvw+E2O+xBce3vP+nPN+73vOe86nUJyfPsGUQeAukBwyPQljdYgcNoxqCPM6EUpyc3M/Wlpaura3t7c/Pz+vh2ke+Fyn07UGg8GbwB+QXSdTYo8S4PIZ8B1wDzABt7u7ux9hseDs7OzCsf5KZmamNRAI+Pr7+x9D9wUQQaoIzYmiqrS01Hx4eHijpaUlA+oPgQsmk8lAl/T09FSwFKAA9osqlUqTl5f3KmSWUwmEkVygrLq6OpNWqzV0dnZexawyQOX3+4U5SUlJRsgXgZySkpLL4Irt7e3/wA4AMZCOelK0QHR87nK5juiUkZFxOTU1lftxyefzBagzGo0Mkghk5efn51C3urrKQG4gH3igVqut4LcA2UB/z8zMHNKJVFlZSZbl9XqF4CiVCgfgKC0tLYjseOIUy8vLXjA/TJ9OTk6+gQzfgXyTtmgZ0bY+NzcnncrGxkaWR31wcCBkRIfExER/YWGhEJjy2traC7Bii8WiLS4ufnt3d/cZZEIdLVAQxqconWofhLGioqLiTeyXH6KfMiklJeWovLxcyIbyxsaGIiEhwdjV1fU+5YGBgQ2w3wBVtED044LrExMT6xQ0Go2uurrah0BSRjU1NbqGhgYz7aSdnR19a2trIDk5+WXKPT09zHacYzliH1na2tqEvmHvuN3uf7AP6xyfJvTRi+zs7Ico7T5t09PTy5g/APB0SluAcQTR+F5BQYHt9KLxyE1NTQ7MtwA8mUp+NYlReQwvAX8CTmAbWFtZWdGAn5tsNhtbZALgFgTFPbqDEpWNjo6WdXR0VBkMhi9h/BjY93g8CvSOdMyhi0mbm5t/YS/ZU/xoaU8Z+asnILEkuDDd6JtvoO8GHLzHRFs8fHx8/Anm3QeEsoELfcSsvi4qKlqdmppapBJdbxoZGbnV29ubU19f7+U9Rn28tLi4+C98WXpmw1YRiPvEPbqOK8NmtVon4/lqOZ/m5mYehAYg7AOZEW/kdOBdpVI5PDQ09IvcQrFsuBvtWOsKEHGsqbgAvAKUIrPvnU7nQqwFz7LjYn2KNb4FXgLEw4bhCTEYN4+ZVeEqeTQ2Nvb7WYvJ6Wpra1m2tuO1eNDOJDEYM6vG3ea02+1xZzY8PMxn/SHwOqAFZCm0jDfgaW9vb/8Jz4NHLpPBwcFZPBts9OsADxfXiUmhwd6C9z29Xv8YF+aPDodjYWtry4Um9pH39fXNmM3mH+DDfakAWHo+kmFlCxNgDCUG41PMQ8LX9DXgAyAT4P8Cv5rdz83/FfgZ4JPC94cPoHQjYBwelYpTxFPDWvML2QLk7DuxLGxGLugDPMBzICIIdDEDiT5cnGADEgzEajAQL00G4utKSC8uxhLJlU5yOh7QlxmKEO1cWLxqpOtGNIr8PIHEOeSh86IuHjrhf75uE+FNCrMEAAAAAElFTkSuQmCC',
    pointer: {
      x: 11,
      y: 13,
    },
    default: 'grab',
  },
  [DrawMode.PANNING]: {
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAZCAQAAACf6xZlAAACCklEQVR4AYXBTUjTcQDH4c/vv83/5irWZL50EIxe1jtBEFqdOpiHiG4RFYbUQY8FWRYdi6hDh2axDh1SM21zsy2tLDK8WGAZdLAORfQqgUtxoek3GCKmmz0PCxjqaOEifpz4ycnJZlZQsbL55/faVs4Sym/jEl6ysGkM3vbc5fqpqDSWonNfi7S/mWqy2F3eJPX2kwj3SFJxW6hLevmGMDsoYp6jtRFJKm6/+liSNrSHe6TJ3yTXN+XdYQ1zGGoaEpK0t73+gSTtjISeSpIjMTJ8I8lp5rA4WB2XpIbkgZgknUw+fy1Jjq7pqaF33MJilkXlrg5JGv7xakhzbIlK6XHiOJlVRywQVw5/JkiSx4w9m5pGUwUxTSmrdJpO3BgyLj/rl9ZFUqPK6tNXWnBjACxaUyNSZVTTyqrvLSHcGAAXsfS4ND6mHBp7OYeNAYNNePC9FlGT4DAuAIPNmfOPtIjSOBU4ychj2/LE1KRy+PCZCD4cZDjxceV4t3I4kuQEXiwyLLys4d61PmXRPUiMtdgYZrjwU07boe5fo/pHx4C7iyp8OJll4SHARi7YD6u7YwMfv01MfBlufrE1QYQqivBgmMNBPgHK2E49N4nyhPs0cowgJSzBwTwWbnyUUMZqggQJsopSAnhxYljA4MLDMgoopIhC/CzFxkFOBgcubGxsXFgY/stgMCzwF1vX1Iv+9v5lAAAAAElFTkSuQmCC',
    pointer: {
      x: 11,
      y: 13,
    },
    default: 'grab',
  },
  [DrawMode.TEXT]: {
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAWCAQAAACm0U5mAAAAMElEQVQYV2P4n/N/JhzmMPyfyfAfBkFsNC5YMYgJVgwCEC6YOQy4aB4EMQmFBizoAOY5hUX4uY1kAAAAAElFTkSuQmCC',
    pointer: {
      x: 4,
      y: 11,
    },
    default: 'text',
  },
  [DrawMode.SELECT]: {
    default: 'default',
  },
}

export function getCursorStyle(mode: DrawMode): string {
  const cursorStyle = CURSOR_STYLE[mode];
  if (!cursorStyle) {
    return 'auto';
  }
  const { image, pointer, default: defaultStyle } = cursorStyle;
  if (image && pointer) {
    return `url('${image}') ${pointer.x ?? 0} ${pointer.y ?? 0}, ${defaultStyle ?? 'auto'}`
  }
  return defaultStyle ?? 'auto';
}
