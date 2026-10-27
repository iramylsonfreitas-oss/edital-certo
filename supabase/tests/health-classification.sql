-- Reviewed public PNCP sample, evaluated by Postgres, not by the JS classifier.
do $test$
declare failures integer;
begin
 with cases(object,expected) as (values
('Aquisição de material de consumo médico-hospitalar e de insumos de radiodiagnóstico por imagem (FIO, para sutura, CONJUNTO, para cateterizacao, ETC), para compor o sistema de registro de preços.',true),
('Registro de preços para aquisição de mobiliário, eletrodomésticos e material médico, tendo como órgão gerenciador a Justiça Federal em Alagoas e como participante o Instituto Federal da Paraíba.',true),
('Contratação de empresa especializada para a prestação de serviços de manejo populacional de cães e gatos, por meio de procedimentos cirúrgicos de esterilização reprodutiva (castração), em regime de mutirão, visando atender às ações de controle populacional e bem-estar animal do Município de Cajamar, conforme condições estabelecidas no instrumento convocatório e seus anexos.',false),
('REGISTRO DE PREÇOS PARA FUTURA E EVENTUAL COMPRA DE CORRELATOS HOSPITALARES - MATERIAL DE SUTURA CIRÚRGICA',true),
('Formação de Registro de Preços para o fornecimento eventual de dispositivos médicos, do tipo equipamentos médico-hospitalares com instalação para o Item 3 – Ultrassom Portátil Digital, visando atender às necessidades do Hospital dos Servidores do Estado de Pernambuco (HSE-PE),',true),
('ABERTURA DE PROCESSO LICITATÓRIO PARA AQUISIÇÃO DE ITENS PARA REABILITAÇÃO, FISIOTERAPIA, EQUIPAMENTOS E MOBILIARIOS DE USO HOSPITALAR PARA ATENDER A SECRETARIA DA SAUDE COM RECURSOS DAS EMENDAS IMPOSITIVAS Nº10,43,54,69,74,90,101,105,106,113,129 E 154 -SECRETARIA MUNICIPAL DE SAÚDE-CONTRATO',true),
('Aquisição de medicamentos de uso humano, destinados ao atendimento das necessidades assistenciais da instituição, visando garantir o abastecimento da farmácia hospitalar e a continuidade dos tratamentos dos pacientes, conforme especificações técnicas e quantitativas definidos no planejamento da contratação.',true),
('AQUISIÇÃO MEDICAMENTOS CONTROLADOS ADESIVOS - 2027',true),
('Aquisição de Cânulas arteriais e venosas para cirurgias cardiológicas (Parte II).',true),
('SRP: MATERIAL MÉDICO - CAPSULA ENDOSCOPICA',true),
('Aquisição de equipamentos médico-hospitalares: Cama elástica, Sistema de Campo Livre, Armário vitrine Cabine audiométrica e outros para o Setor de Reabilitação do Centro Estadual de Reabilitação e Atenção Ambulatorial Especializada - CERAE/RN por Pregão Eletrônico - Lei 14.133/2021. Esta aquisição será executada pelo recurso da Emenda Parlamentar relacionada a Proposta nº 1403.1955000.1190-29',true),
('AQUISIÇÃO DE 02 (DUAS) UNIDADES DE TRATAMENTO DE AR (UTA), DESTINADAS AO ATENDIMENTO DAS NECESSIDADES DE CLIMATIZAÇÃO E CONTROLE DA QUALIDADE DO AR DE 02 (DUAS) SALAS CIRÚRGICAS DA SANTA CASA DE MISERICÓRDIA SÃO VICENTE DE PAULO, LOCALIZADA NO MUNICÍPIO DE BOA ESPERANÇA DO SUL/SP',false),
('CONSTITUIÇÃO DE SISTEMA DE REGISTRO DE PREÇOS PARA AQUISIÇÃO FUTURA DE MATERIAIS MÉDICO-HOSPITALARES (ATADURA ELASTICA POROSA, ETC), PARA ATENDER AS NECESSIDADES DO NÚCLEO DE SUPRIMENTOS',true),
('AQUISIÇÃO DE INSUMOS PARA CIRURGIA  (BUCOMAXILO -PROTESE DE ATM TOTAL TIPO STANDART)',true),
('Serviços de Manutenção preventiva e/ou corretiva, com fornecimento de peças, de equipamentos hospitalares, odontológicos, de fisioterapia e câmaras refrigeradoras de vacina, pertencentes a Secretaria de Saúde do Município de Maripá/PR.',false),
('AQUISIÇÃO DE MEDICAMENTOS - SMS - SEI 43.206008.000034/2026-69 (Portal de Compras Públicas)',true),
('Registro de preços para fornecimento parcelado de MATERIAIS DE CONSUMO ODONTOLÓGICO COMPLEMENTAR, conforme as características, condições, obrigações e requisitos técnicos contidos no Termo de Referência – Anexo I do Edital.',true),
('Aquisição de medicamento(s) com marca específica não contemplados em ata de registro de preços em cumprimento a determinação judicial. ',true),
('[Portal de Compras Públicas] - REGISTRO DE PREÇOS PARA AQUISIÇÃO DE MATERIAL HOSPITALAR (FREESTYLE LIBRE PLUS 2) PARA ATENDIMENTO DE DEMANDA JUDICIAL (AÇÃO JUDICIAL), conforme condições, quantidades e exigências estabelecidas neste Edital e seus anexos.',true),
('ABERTURA DE PROCESSO LICITATÓRIO PARA CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS AFIM DE ATENDER A DEMANDA REPRIMIDA DO MUNICÍPIO  COM RECURSO DE EMENDA PARLAMENTAR IMPOSITIVA N.º 68 - SECRETARIA MUNICIPAL DE SAÚDE; COM APLICAÇÃO DAS COTAS ABERTAS E RESERVADAS, NOS TERMOS DO ARTIGO 48, INCISO III DA LEI COMPLEMENTAR Nº 123/2006 EM CONFORMIDADE COM A LEI Nº 14.133/2021 - CONTRATO.',false),
('O objeto da licitação é a prestação dos Serviços Continuados em horas/ano de profissionais de saúde na área de Técnico de Enfermagem de Atendimento Pré-Hospitalar Móvel, para atender as necessidades do Serviço de Atendimento Pré-Hospitalar Móvel/SAMU 192 CE, nas Regiões de Saúde: Fortaleza, Sertão Central, Litoral Leste/Jaguaribe, Cariri e Sobral, pelo período de até 12 (doze) meses, nas condições estabelecidas neste edital e seus anexos.',false),
('AQUISIÇÃO DE EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL (EPIS) — JOELHEIRAS ARTICULADAS, COTOVELEIRAS ARTICULADAS, CAPACETES INTEGRAIS E LUVAS TÁTICAS — PARA O AGRUPAMENTO DE MOTOCICLISTAS DA GUARDA MUNICIPAL DE CHAPECÓ/SC.',false),
('AQUISIÇÃO DE MEDICAMENTOS EM ATENDIMENTO A DEMANDAS JUDICIAIS DE PACIENTES DA REGIÃO DO DEPARTAMENTO REGIONAL DE SAÚDE DE SÃO JOSÉ DO RIO PRETO - DRS.XV.',true),
('[Portal de Compras Públicas] - SRP Aquisição de medicamentos padronizados do Grupo dos Medicamentos Controlados. SS',true),
('MEDICAMENTOS E CORRELATOS',true),
('Aquisição de equipamentos médico-hospitalares, a fim de atender às necessidades do Hospital Universitário de Brasília (HUB).',true),
('[Portal de Compras Públicas] - Registro de Preços para futura e eventual aquisição de materiais odontológicos, para atender as demandas habituais da Secretaria Municipal de Saúde de Coimbra-MG.',true),
('Contratação de empresa especializada para o fornceimento de medicamentos (DIPIRIDAMOL 10 MG 2 ML), para atender as necessidades do Consórcio Público Interfederativo de Saúde da Chapada Norte – CONSAN.',true),
('Aquisição de itens diversos e de consumo hospitalar, para garantir as condições adequadas de funcionamento das ambulâncias do município de Estrela Dalva/MG, conforme especificações mínimas estabelecidas no Apêndice A do Termo de Referência.',true),
('REGISTRO DE PREÇOS PARA EVENTUAL AQUISIÇÃO DE MATERIAIS DE ENFERMAGEM E CORRELATOS MÉDICO-HOSPITALARES, VISANDO O ABASTECIMENTO DA REDE MUNICIPAL DE SAÚDE E AO ATENDIMENTO DAS NECESSIDADES DOS USUÁRIOS DO SISTEMA PÚBLICO DE SAÚDE.',true),
('Contratação de empresa especializada para prestação de serviços de limpeza hospitalar, higienização, conservação, jardinagem,asseio e desinfecção de bens móveis e imóveis, incluso desinfecção de superfícies e equipamentos, manutenção e limpeza de áreasverdes, além da limpeza e conservação de piscina. A prestação dos serviços deve abranger a disponibilização de mão de obra comdedicação exclusiva, bem como todos os insumos necessários para a execução adequada das atividades, conforme as condições eexigências estabelecidas neste instrumento.',false),
('Aquisição de 06 (seis) aparelhos de ar-condicionado e contratação dos respectivos serviços de instalação, incluindo o fornecimento de todos os materiais, insumos e demais componentes necessários à sua completa execução, destinados ao Escritório Administrativo do Conselho Federal de Enfermagem – Cofen, localizado na cidade do Rio de Janeiro/RJ, conforme especificações, condições e exigências estabelecidas no Edital e seus anexos.',false),
('REGISTRO DE PREÇOS PARA FUTURA E EVENTUAL CONTRATAÇÃO DE EMPRESA
ESPECIALIZADA PARA O FORNECIMENTO PARCELADO DE MEDICAMENTOS COM MAIOR PERCENTUAL DESCONTO SOBRE OS PREÇOS FIXADOS NO BANCO DE PREÇOS EM SAUDE (BPS) DO MINISTÉRIO DA SAUDE PARA ATENDIMENTO DAS NECESSIDADES DA SECRETARIA MUNICIPAL DE SAUDE DE RIO NOVO-MG, de acordo com o Edital.',true),
('AQUISIÇÃO MATERIAL MÉDICO HOSPITALAR COM COMODATO',true),
('AQUISIÇÃO DE MEDICAMENTOS',true),
(' Materiais Respiratórios, de UTI, Centro Cirúrgico, Anestesia e Outros para a Central de Equipamentos',true),
('Registro de Preços para Aquisição de Dispositivos Médicos: Órteses, Próteses e Materiais Especiais (OPME) para o serviço de Ortopedia, especialidade Ombro, a fim de atender às necessidades do Hospital Universitário Maria Aparecida Pedrossian - Humap/UFMS, por um período estimado de 12 (doze) meses.',true),
('REGISTRO DE PREÇOS PARA FUTURA E EVENTUAL AQUISIÇÃO DE PRÓTESES ODONTOLÓGICAS DESTINADAS AO ATENDIMENTO DA POPULAÇÃO MUNICIPAL, NO ÂMBITO DAS AÇÕES DE SAÚDE BUCAL DO SUS.',true),
('Aquisição de medicamento por marca específica para continuidade no atendimento de paciente(s) em cumprimento à determinação judicial. ',true),
('registro de preços para possível aquisição de MEDICAMENTOS E FÓRMULAS NUTRICIONAIS a fim de atender a UPA, SAMU, Rede de Atenção Básica e Rede de Atenção Especializada à Saúde, da Secretaria de Saúde de Itanhaém por um período de 12 meses',true))
 select count(*) into failures from cases where (cardinality(public.classify_health_object(object))>0) is distinct from expected;
 if failures<>0 then raise exception 'Health classification: % reviewed cases failed',failures; end if;
 if exists(select 1 from public.tenders where health_categories is distinct from public.classify_health_object(object)) then raise exception 'Health cache mismatch'; end if;
 if (select count(*) from public.search_tenders_by_segment(p_segment=>'health',p_show_closed=>true,p_page_size=>100))<>54 then raise exception 'Health fixture scope mismatch'; end if;
 if (select count(*) from public.search_tenders_by_segment(p_segment=>'it',p_show_closed=>true,p_page_size=>100))<>53 then raise exception 'TI fixture regression'; end if;
 if (select count(*) from public.search_tenders_by_segment(p_segment=>'health',p_health_category=>'equipment',p_show_closed=>true))<>1 then raise exception 'Equipment filter mismatch'; end if;
 if exists(select 1 from public.search_tenders_by_segment(p_segment=>'bad')) then raise exception 'Invalid segment returned rows'; end if;
end;
$test$;
select 40 as reviewed_health_cases_passed;
