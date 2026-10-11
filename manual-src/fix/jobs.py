import json
def J(no,t,st,date,time,addr,town,pc,client,tenants="",inv="",invno="",**kw):
    d=dict(id="job_"+no,jobNo=no,type=t,status=st,date=date,time=time,address=addr,town=town,postcode=pc,
      client=client,tenants=tenants,tenantEmails="",agentEmail="",notes="",invoice=inv,invoiceNo=invno,
      bedrooms="2",extraAreas="",propertyType="Flat")
    d.update(kw); return d
EL,SE="Example Lettings","Sample Estates"
jobs=[
 J("WPS261001","ICI","signed","2026-10-01","10:00","Flat 4, Harbour Court, 12 Sample Street","London","E3 9ZA",EL,"Jo Example",inv="paid",invno="INV-0139",sentAt="2026-10-02T16:00:00Z",processingAt="2026-10-01T13:00:00Z"),
 J("WPS261002","CO","sent","2026-10-02","11:00","27 Test Gardens","London","E14 9ZB",SE,"Sam Tester",inv="invoiced",invno="INV-0142",sentAt="2026-10-03T15:00:00Z",processingAt="2026-10-02T14:00:00Z"),
 J("WPS261003","MTI","sent","2026-10-07","09:30","Flat 12, Mock Tower, 3 Dummy Lane","London","E2 9ZC",EL,sentAt="2026-10-08T12:00:00Z",processingAt="2026-10-07T11:00:00Z"),
 J("WPS261004","ICI","sent","2026-10-07","13:00","9 Placeholder Road","London","E3 9ZD",EL,"Chris Demo",tenantEmails="chris.demo@example.com",sentAt="2026-10-07T18:00:00Z",processingAt="2026-10-07T15:00:00Z"),
 J("WPS261005","ICI","sent","2026-10-04","10:00","Flat 2, Sample House, 40 Example Way","London","E15 9ZE",SE,"Pat Sample",sentAt="2026-10-05T10:00:00Z",processingAt="2026-10-04T12:00:00Z"),
 J("WPS261006","CO","processing","2026-10-12","11:00","Flat 7, Demo Court, 5 Fictional Street","London","E3 9ZF",EL,"Lee Specimen",processingAt="2026-10-12T15:00:00Z"),
 J("WPS261007","ICI","completed","2026-10-09","10:00","63 Trial Avenue","London","E17 9ZG",SE,processingAt="2026-10-09T16:00:00Z"),
 J("WPS261014","MTI","processing","2026-10-12","15:00","Flat 1, Model Mews","London","E1 9ZH",EL,processingAt="2026-10-12T17:00:00Z"),
 J("WPS261008","ICI","booked","2026-10-13","10:00","Flat 3, Pretend Place, 8 Sample Street","London","E3 9ZJ",EL,"Alex Test 07700 900111"),
 J("WPS261009","CO","booked","2026-10-13","14:30","14 Imaginary Road","London","E9 9ZK",SE,"Robin Mock"),
 J("WPS261010","ICI","booked","2026-10-14","","Flat 6, Example Heights","London","E14 9ZL",EL),
 J("WPS261011","MTI","booked","2026-10-15","11:00","22 Dummy Crescent","London","E6 9ZM",SE),
 J("WPS261012","SOC","booked","2026-10-17","10:00","Unit 5, Test Wharf","London","E16 9ZN",EL),
 J("WPS261013","CLN","booked","2026-10-19","","Flat 9, Sample Lofts","London","E2 9ZP",SE),
 J("WPS260915","ICI","archived","2026-09-15","10:00","3 Old Example Road","London","E3 9ZQ",EL,inv="paid",invno="INV-0120",sentAt="2026-09-16T12:00:00Z"),
]
clients=[dict(name=EL,contactName="Alex Sample",contactPhone="07700 900123",contactEmail="lettings@example.com"),
         dict(name=SE,contactName="",contactPhone="",contactEmail="office@example.org")]
json.dump(dict(jobs=jobs,clients=clients),open("fix/data.json","w"),indent=1)
print(len(jobs))
