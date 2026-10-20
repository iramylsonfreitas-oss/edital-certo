import { describe, expect, it } from "vitest";
import { createDeadlineCalendar, type DeadlineEvent } from "./calendar";

const event: DeadlineEvent = { id: "contratacao-123", title: "Aquisição de computadores", deadline: "2026-11-01T15:00:00Z", agency: "Órgão; setor, TI", url: "https://pncp.gov.br/app/editais/123" };
const now = new Date("2026-10-20T15:00:00Z");
const unfold = (content: string) => content.replace(/\r\n /g, "");

describe("calendário de prazos", () => {
  it("exporta horário UTC e três lembretes de exibição", () => {
    const content = unfold(createDeadlineCalendar(event, true, now));
    expect(content).toContain("DTSTART:20261101T150000Z\r\nDTEND:20261101T153000Z");
    for (const days of [7, 3, 1]) expect(content).toContain(`TRIGGER:-P${days}D`);
    expect(content.match(/BEGIN:VALARM/g)).toHaveLength(3);
    expect(content).not.toContain("ATTENDEE");
  });
  it("omite lembretes passados e permite exportar sem lembretes", () => {
    const near = new Date("2026-10-30T15:00:00Z");
    expect(createDeadlineCalendar(event, true, near).match(/BEGIN:VALARM/g)).toHaveLength(1);
    expect(createDeadlineCalendar(event, false, now)).not.toContain("VALARM");
    expect(createDeadlineCalendar(event, true, new Date("2026-11-01T14:00:00Z"))).not.toContain("VALARM");
  });
  it("mantém identificador quando título ou prazo são retificados", () => {
    const uid = (content: string) => content.split("\r\n").find((line) => line.startsWith("UID:"));
    expect(uid(createDeadlineCalendar(event, true, now))).toBe(uid(createDeadlineCalendar({...event,title:"Retificado",deadline:"2026-11-02T15:00:00Z"},true,now)));
  });
  it("escapa texto e dobra linhas em até 75 bytes sem quebrar UTF-8", () => {
    const title = "Descrição çã😀,".repeat(20) + "\r\nBEGIN:VTODO";
    const content = createDeadlineCalendar({...event,title},true,now);
    for (const line of content.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const logical = unfold(content);
    expect(logical).toContain(title.replace(/,/g,"\\,").replace(/\r\n/g,"\\n"));
    expect(content).not.toContain("\r\nBEGIN:VTODO");
    expect(logical).toContain("Órgão\\; setor\\, TI\\nFonte oficial:");
  });
  it("não exporta URLs inseguras ou prazos inválidos e encerrados", () => {
    expect(createDeadlineCalendar({...event,url:"javascript:alert(1)"},true,now)).not.toContain("javascript:");
    expect(createDeadlineCalendar({...event,url:"https://example.com/\r\nBEGIN:VTODO"},true,now)).not.toContain("example.com");
    expect(()=>createDeadlineCalendar({...event,deadline:"inválida"},true,now)).toThrow();
    expect(()=>createDeadlineCalendar(event,true,new Date(event.deadline))).toThrow();
  });
});
