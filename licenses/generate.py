import os 
import os.path

output=""
template="<h2>%s</h2><pre>%s</pre>"

for parent,dirnames,filenames in os.walk("."): 
    for filename in filenames:  
        if filename[:7]!="license" or filename[-4:]!=".txt": continue
        #print(filename) 
        content=open(filename,encoding="utf-8").read()
        if "html" in content: print("Not Plain Text:", filename)
        output+=template%(filename[8:-4], content)

open("license.html","w",encoding="utf-8").write(output)
